import pytest
from pydantic import ValidationError

from clipwise_worker.highlight_models import (
    CandidateDetail,
    DetailBatchResponse,
    ScoreBatchResponse,
    SelectionResponse,
    build_strict_tool_schema,
)


def test_score_response_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate(
            {
                "items": [
                    {
                        "windowId": "window-0001",
                        "finalScore": 80,
                        "type": "方法",
                        "recommendationReason": "完整方法",
                        "unexpected": True,
                    }
                ]
            }
        )


def test_score_response_rejects_invalid_type():
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate(
            {
                "items": [
                    {
                        "windowId": "window-0001",
                        "finalScore": 80,
                        "type": "闲聊",
                        "recommendationReason": "不合法类型",
                    }
                ]
            }
        )


def test_candidate_details_require_exactly_three_non_empty_titles():
    with pytest.raises(ValidationError):
        CandidateDetail.model_validate(
            {
                "windowId": "window-0001",
                "titleOptions": ["只有一个标题"],
                "summary": "摘要",
                "quote": "原文",
                "riskNotices": [],
            }
        )


def assert_deepseek_strict_object(schema):
    if schema.get("type") == "object":
        assert schema.get("additionalProperties") is False
        assert set(schema.get("required", [])) == set(
            schema.get("properties", {})
        )
    for child in schema.get("properties", {}).values():
        assert_deepseek_strict_object(child)
    if "items" in schema:
        assert_deepseek_strict_object(schema["items"])
    for child in schema.get("$defs", {}).values():
        assert_deepseek_strict_object(child)
    for child in schema.get("anyOf", []):
        assert_deepseek_strict_object(child)


@pytest.mark.parametrize(
    ("model", "name"),
    [
        (ScoreBatchResponse, "submit_window_scores"),
        (SelectionResponse, "submit_candidate_selection"),
        (DetailBatchResponse, "submit_candidate_details"),
    ],
)
def test_strict_tool_schema_requires_every_property(model, name):
    tool = build_strict_tool_schema(model, name, "提交结构化结果")

    assert tool["type"] == "function"
    assert tool["function"]["name"] == name
    assert tool["function"]["strict"] is True
    assert_deepseek_strict_object(tool["function"]["parameters"])
