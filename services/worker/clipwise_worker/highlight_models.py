from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ClipType = Literal["观点", "方法", "案例", "避坑", "对比", "总结", "金句"]

# Phase 5.1 editor recall：模型推荐档位与拒绝/选择原因
Recommendation = Literal["strong", "recommended", "backup", "reject"]
RejectionReason = Literal[
    "none",
    "small_talk",
    "transition",
    "fragmented",
    "duplicate",
    "low_information",
    "asr_noise",
    "too_context_dependent",
    "promotion_or_admin",
]
SelectionStatus = Literal[
    "scored",
    "below_recall_threshold",
    "time_duplicate",
    "semantic_duplicate",
    "topic_diversity_skipped",
    "selected",
    "rejected",
]


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


class ScoreDimensions(StrictModel):
    information_density: int = Field(alias="informationDensity", ge=1, le=5)
    hook_strength: int = Field(alias="hookStrength", ge=1, le=5)
    standalone_clarity: int = Field(alias="standaloneClarity", ge=1, le=5)
    editability: int = Field(ge=1, le=5)


class WindowScore(StrictModel):
    window_id: str = Field(alias="windowId")
    recommendation: Recommendation
    final_score: int = Field(alias="finalScore", ge=0, le=100)
    dimensions: ScoreDimensions
    rejection_reason: RejectionReason = Field(alias="rejectionReason")
    topic_label: str = Field(alias="topicLabel")
    type: ClipType
    recommendation_reason: str = Field(alias="recommendationReason")


class ScoreBatchResponse(StrictModel):
    items: list[WindowScore]


class ScoredWindow(StrictModel):
    window: CandidateWindow
    recommendation: Recommendation
    final_score: int = Field(ge=0, le=100)
    dimensions: ScoreDimensions
    type: ClipType
    rejection_reason: RejectionReason
    topic_label: str
    recommendation_reason: str
    needs_setup: bool = False
    boundary_reason: str = ""


class BoundaryDecision(StrictModel):
    window_id: str = Field(alias="windowId")
    keep: bool
    duplicate_of: str | None = Field(alias="duplicateOf")
    start_segment_id: str = Field(alias="startSegmentId")
    end_segment_id: str = Field(alias="endSegmentId")
    boundary_reason: str = Field(alias="boundaryReason")
    needs_setup: bool = Field(alias="needsSetup")


class SelectionResponse(StrictModel):
    items: list[BoundaryDecision]


class FinalCandidateInput(StrictModel):
    window_id: str
    recommendation: Recommendation
    final_score: int = Field(ge=0, le=100)
    dimensions: ScoreDimensions
    type: ClipType
    rejection_reason: RejectionReason
    topic_label: str
    recommendation_reason: str
    needs_setup: bool = False
    boundary_reason: str = ""
    start_ms: int
    end_ms: int
    segment_ids: list[str]
    text: str


class CandidateDetail(StrictModel):
    window_id: str = Field(alias="windowId")
    title_options: list[str] = Field(alias="titleOptions")
    summary: str
    quote: str
    editing_note: str = Field(alias="editingNote")
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
    recommendation: Recommendation
    final_score: int = Field(ge=0, le=100)
    dimensions: ScoreDimensions
    type: ClipType
    rejection_reason: RejectionReason
    topic_label: str
    start_ms: int
    end_ms: int
    title_options: list[str]
    selected_title: str
    summary: str
    quote: str
    recommendation_reason: str
    editing_note: str
    boundary_reason: str
    needs_setup: bool
    risk_notices: list[str]
    subtitles: list[FinalSubtitle]


class WindowScoreAudit(StrictModel):
    window_id: str
    start_ms: int
    end_ms: int
    segment_ids: list[str]
    text_preview: str
    recommendation: Recommendation
    final_score: int = Field(ge=0, le=100)
    type: ClipType
    dimensions: ScoreDimensions
    rejection_reason: RejectionReason
    topic_label: str
    recommendation_reason: str
    selection_status: SelectionStatus
    selection_reason: str
    duplicate_of_window_id: str | None = None


class HighlightPipelineResult(StrictModel):
    candidates: list[FinalCandidate]
    window_scores: list[WindowScoreAudit]


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
