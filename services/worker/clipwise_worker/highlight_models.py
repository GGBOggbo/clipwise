from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ClipType = Literal["观点", "方法", "案例", "避坑", "对比", "总结", "金句"]


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        populate_by_name=True,
    )


class TranscriptSegment(StrictModel):
    id: str
    index: int
    start_ms: int
    end_ms: int
    text: str


class CandidateWindow(StrictModel):
    window_id: str
    start_ms: int
    end_ms: int
    segment_ids: list[str]
    text: str


class WindowScore(StrictModel):
    window_id: str = Field(alias="windowId")
    final_score: int = Field(alias="finalScore", ge=0, le=100)
    type: ClipType
    recommendation_reason: str = Field(alias="recommendationReason")


class ScoreBatchResponse(StrictModel):
    items: list[WindowScore]


class ScoredWindow(StrictModel):
    window: CandidateWindow
    final_score: int = Field(ge=0, le=100)
    type: ClipType
    recommendation_reason: str


class BoundaryDecision(StrictModel):
    window_id: str = Field(alias="windowId")
    keep: bool
    duplicate_of: str | None = Field(alias="duplicateOf")
    start_segment_id: str = Field(alias="startSegmentId")
    end_segment_id: str = Field(alias="endSegmentId")


class SelectionResponse(StrictModel):
    items: list[BoundaryDecision]


class FinalCandidateInput(StrictModel):
    window_id: str
    final_score: int = Field(ge=0, le=100)
    type: ClipType
    recommendation_reason: str
    start_ms: int
    end_ms: int
    segment_ids: list[str]
    text: str


class CandidateDetail(StrictModel):
    window_id: str = Field(alias="windowId")
    title_options: list[str] = Field(alias="titleOptions")
    summary: str
    quote: str
    risk_notices: list[str] = Field(alias="riskNotices")

    @field_validator("title_options")
    @classmethod
    def require_three_titles(cls, value: list[str]) -> list[str]:
        if len(value) != 3 or any(not title.strip() for title in value):
            raise ValueError("titleOptions must contain three non-empty titles")
        return value


class DetailBatchResponse(StrictModel):
    items: list[CandidateDetail]


class FinalSubtitle(StrictModel):
    start_ms: int
    end_ms: int
    text: str


class FinalCandidate(StrictModel):
    rank: int
    final_score: int = Field(ge=0, le=100)
    type: ClipType
    start_ms: int
    end_ms: int
    title_options: list[str]
    selected_title: str
    summary: str
    quote: str
    recommendation_reason: str
    risk_notices: list[str]
    subtitles: list[FinalSubtitle]


_UNSUPPORTED_STRICT_KEYWORDS = {
    "default",
    "$defs",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "title",
}


def _inline_json_schema_refs(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, list):
        return [_inline_json_schema_refs(item, defs) for item in node]
    if not isinstance(node, dict):
        return node

    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/$defs/"):
        name = ref.removeprefix("#/$defs/")
        if name not in defs:
            raise ValueError(f"unknown schema ref: {ref}")
        merged = {
            **_inline_json_schema_refs(defs[name], defs),
            **{
                key: _inline_json_schema_refs(value, defs)
                for key, value in node.items()
                if key != "$ref"
            },
        }
        return merged

    return {
        key: _inline_json_schema_refs(value, defs)
        for key, value in node.items()
        if key != "$defs"
    }


def _normalize_strict_schema(node: Any) -> Any:
    if isinstance(node, list):
        return [_normalize_strict_schema(item) for item in node]
    if not isinstance(node, dict):
        return node

    normalized = {
        key: _normalize_strict_schema(value)
        for key, value in node.items()
        if key not in _UNSUPPORTED_STRICT_KEYWORDS
    }
    if normalized.get("type") == "object":
        properties = normalized.get("properties", {})
        normalized["additionalProperties"] = False
        normalized["required"] = list(properties)
    return normalized


def build_strict_tool_schema(
    model: type[StrictModel],
    name: str,
    description: str,
) -> dict[str, Any]:
    raw_schema = model.model_json_schema(by_alias=True)
    inlined_schema = _inline_json_schema_refs(
        raw_schema,
        raw_schema.get("$defs", {}),
    )
    parameters = _normalize_strict_schema(inlined_schema)
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "strict": True,
            "parameters": parameters,
        },
    }
