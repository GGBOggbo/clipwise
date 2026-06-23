import pytest
from pydantic import ValidationError

from clipwise_worker.highlight_models import (
    CandidateDetail,
    DetailBatchResponse,
    ScoreBatchResponse,
    SelectionResponse,
    build_strict_tool_schema,
)


def valid_score_item(**overrides):
    item = {
        "windowId": "window-0001",
        "recommendation": "recommended",
        "finalScore": 76,
        "dimensions": {
            "informationDensity": 4,
            "hookStrength": 3,
            "standaloneClarity": 4,
            "editability": 4,
        },
        "rejectionReason": "none",
        "topicLabel": "AI 项目报价",
        "type": "方法",
        "recommendationReason": "有明确判断标准。",
    }
    item.update(overrides)
    return item


def test_score_response_accepts_editor_recall_fields():
    response = ScoreBatchResponse.model_validate({"items": [valid_score_item()]})

    score = response.items[0]
    assert score.recommendation == "recommended"
    assert score.dimensions.information_density == 4
    assert score.topic_label == "AI 项目报价"


@pytest.mark.parametrize(
    "field,value",
    [
        ("recommendation", "maybe"),
        ("rejectionReason", "boring"),
    ],
)
def test_score_response_rejects_invalid_editor_enums(field, value):
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate({"items": [valid_score_item(**{field: value})]})


def test_score_response_rejects_dimension_out_of_range():
    item = valid_score_item(
        dimensions={
            "informationDensity": 6,
            "hookStrength": 3,
            "standaloneClarity": 4,
            "editability": 4,
        }
    )

    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate({"items": [item]})


def test_score_response_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate(
            {
                "items": [
                    valid_score_item(
                        finalScore=80,
                        type="方法",
                        recommendationReason="完整方法",
                        unexpected=True,
                    )
                ]
            }
        )


def test_score_response_rejects_invalid_type():
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate(
            {
                "items": [
                    valid_score_item(
                        finalScore=80,
                        type="闲聊",
                        recommendationReason="不合法类型",
                    )
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


@pytest.mark.parametrize(
    ("model", "name"),
    [
        (ScoreBatchResponse, "submit_window_scores"),
        (SelectionResponse, "submit_candidate_selection"),
        (DetailBatchResponse, "submit_candidate_details"),
    ],
)
def test_strict_tool_schema_inlines_refs_for_deepseek(model, name):
    tool = build_strict_tool_schema(model, name, "提交结构化结果")
    encoded = str(tool["function"]["parameters"])

    assert "$defs" not in encoded
    assert "$ref" not in encoded
