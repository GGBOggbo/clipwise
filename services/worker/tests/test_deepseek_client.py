import json
from types import SimpleNamespace

import pytest

from clipwise_worker.config import WorkerConfig
from clipwise_worker.deepseek import DeepSeekClient, DeepSeekError
from clipwise_worker.highlight_models import (
    CandidateWindow,
    FinalCandidateInput,
    ScoreDimensions,
    ScoredWindow,
)


def test_worker_config_reads_deepseek_settings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://example")
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "deepseek-key")
    monkeypatch.setenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/beta")
    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
    monkeypatch.setenv("DEEPSEEK_OUTPUT_MODE", "strict_tool")

    config = WorkerConfig.from_env()

    assert config.deepseek_api_key == "deepseek-key"
    assert config.deepseek_api_base == "https://api.deepseek.com/beta"
    assert config.deepseek_model == "deepseek-v4-flash"
    assert config.deepseek_output_mode == "strict_tool"


def test_worker_config_reads_max_concurrency(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://example")
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    monkeypatch.setenv("WORKER_MAX_CONCURRENCY", "3")

    config = WorkerConfig.from_env()

    assert config.max_concurrency == 3


def test_worker_config_defaults_max_concurrency_to_two(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://example")
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    monkeypatch.delenv("WORKER_MAX_CONCURRENCY", raising=False)

    config = WorkerConfig.from_env()

    assert config.max_concurrency == 2


def completion(arguments, *, name="submit_window_scores", finish_reason="tool_calls"):
    tool_calls = (
        []
        if arguments is None
        else [
            SimpleNamespace(
                type="function",
                function=SimpleNamespace(
                    name=name,
                    arguments=(
                        arguments
                        if isinstance(arguments, str)
                        else json.dumps(arguments, ensure_ascii=False)
                    ),
                ),
            )
        ]
    )
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                finish_reason=finish_reason,
                message=SimpleNamespace(tool_calls=tool_calls),
            )
        ]
    )


class RecordingCompletions:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class FakeSdk:
    def __init__(self, outcomes):
        self.completions = RecordingCompletions(outcomes)
        self.chat = SimpleNamespace(completions=self.completions)


class FakeHttpError(RuntimeError):
    def __init__(self, status_code, message="request failed"):
        super().__init__(message)
        self.status_code = status_code


def candidate_windows():
    return [
        CandidateWindow(
            window_id="window-0001",
            start_ms=0,
            end_ms=90_000,
            segment_ids=["segment-1", "segment-2"],
            text="第一个完整观点",
        )
    ]


def valid_score_payload():
    return {
        "items": [
            {
                "windowId": "window-0001",
                "recommendation": "recommended",
                "finalScore": 88,
                "dimensions": {
                    "informationDensity": 4,
                    "hookStrength": 3,
                    "standaloneClarity": 4,
                    "editability": 4,
                },
                "rejectionReason": "none",
                "topicLabel": "AI 项目",
                "type": "观点",
                "recommendationReason": "观点完整，可独立传播",
            }
        ]
    }


def final_candidate_inputs():
    return [
        FinalCandidateInput(
            window_id="window-0001",
            recommendation="recommended",
            final_score=88,
            dimensions=ScoreDimensions(
                informationDensity=4,
                hookStrength=3,
                standaloneClarity=4,
                editability=4,
            ),
            type="观点",
            rejection_reason="none",
            topic_label="AI 项目",
            recommendation_reason="观点完整，可独立传播",
            start_ms=0,
            end_ms=90_000,
            segment_ids=["segment-1", "segment-2"],
            text="第一个完整观点，可以直接作为原文金句。",
        )
    ]


def detail_payload(*, quote: str):
    return {
        "items": [
            {
                "windowId": "window-0001",
                "titleOptions": ["标题一", "标题二", "标题三"],
                "summary": "摘要",
                "quote": quote,
                "editingNote": "保留开头观点。",
                "riskNotices": [],
            }
        ]
    }


def test_candidate_details_retries_batch_when_quote_is_not_verbatim():
    sdk = FakeSdk(
        [
            completion(
                detail_payload(quote="模型润色后的金句"),
                name="submit_candidate_details",
            ),
            completion(
                detail_payload(quote="第一个完整观点"),
                name="submit_candidate_details",
            ),
        ]
    )
    sleeps = []
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=sdk,
        sleeper=sleeps.append,
    )

    result = client.generate_candidate_details(final_candidate_inputs())

    assert result[0].quote == "第一个完整观点"
    assert len(sdk.completions.calls) == 2
    assert sleeps == [1]


def test_score_windows_forces_named_strict_tool_and_non_thinking_mode():
    sdk = FakeSdk([completion(valid_score_payload())])
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=sdk,
    )

    result = client.score_windows(candidate_windows())

    assert result[0].window_id == "window-0001"
    assert result[0].recommendation == "recommended"
    assert result[0].dimensions.information_density == 4
    kwargs = sdk.completions.calls[0]
    assert kwargs["model"] == "deepseek-v4-flash"
    assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}
    assert kwargs["tools"][0]["function"]["strict"] is True
    assert kwargs["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_window_scores"},
    }
    assert kwargs["temperature"] == 0


def test_score_prompt_uses_editor_recall_role():
    sdk = FakeSdk([completion(valid_score_payload())])
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=sdk,
        sleeper=lambda _: None,
    )

    client.score_windows(
        [
            CandidateWindow(
                window_id="window-0001",
                start_ms=0,
                end_ms=120_000,
                segment_ids=["s1"],
                text="有效内容",
            )
        ]
    )

    system_prompt = sdk.completions.calls[0]["messages"][0]["content"]
    assert "剪辑师" in system_prompt
    assert "不是判断最终爆款" in system_prompt
    assert "backup" in system_prompt


@pytest.mark.parametrize(
    "response",
    [
        completion(valid_score_payload(), finish_reason="stop"),
        completion(None),
        SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="tool_calls",
                    message=SimpleNamespace(
                        tool_calls=[
                            completion(valid_score_payload()).choices[
                                0
                            ].message.tool_calls[0],
                            completion(valid_score_payload()).choices[
                                0
                            ].message.tool_calls[0],
                        ]
                    ),
                )
            ]
        ),
        completion(valid_score_payload(), name="wrong_function"),
        completion("{not-json"),
    ],
)
def test_score_windows_rejects_invalid_tool_call_shapes(response):
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=FakeSdk([response, response, response]),
        sleeper=lambda _: None,
    )

    with pytest.raises(DeepSeekError) as exc_info:
        client.score_windows(candidate_windows())

    assert exc_info.value.code == "deepseek_invalid_response"


def test_score_windows_retries_429_twice_then_succeeds():
    sleeps = []
    sdk = FakeSdk(
        [
            FakeHttpError(429),
            FakeHttpError(429),
            completion(valid_score_payload()),
        ]
    )
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=sdk,
        sleeper=sleeps.append,
    )

    result = client.score_windows(candidate_windows())

    assert result[0].final_score == 88
    assert len(sdk.completions.calls) == 3
    assert sleeps == [1, 2]


def test_score_windows_does_not_retry_schema_rejection():
    sdk = FakeSdk([FakeHttpError(400, "invalid function schema")])
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=sdk,
        sleeper=lambda _: pytest.fail("must not retry"),
    )

    with pytest.raises(DeepSeekError) as exc_info:
        client.score_windows(candidate_windows())

    assert exc_info.value.code == "deepseek_request_failed"
    assert len(sdk.completions.calls) == 1


def test_score_windows_rejects_missing_or_unknown_window_ids():
    payload = valid_score_payload()
    payload["items"][0]["windowId"] = "window-unknown"
    response = completion(payload)
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=FakeSdk([response, response, response]),
        sleeper=lambda _: None,
    )

    with pytest.raises(DeepSeekError) as exc_info:
        client.score_windows(candidate_windows())

    assert exc_info.value.code == "deepseek_invalid_response"


def scored_candidates(count=3):
    dimensions = ScoreDimensions(
        informationDensity=4,
        hookStrength=3,
        standaloneClarity=4,
        editability=4,
    )
    return [
        ScoredWindow(
            window=CandidateWindow(
                window_id=f"window-{index:04d}",
                start_ms=index * 120_000,
                end_ms=index * 120_000 + 90_000,
                segment_ids=[f"s{index}-1", f"s{index}-2"],
                text=f"第{index}段完整正文，这里只是reduce卡片不应带上的内容",
            ),
            recommendation="recommended",
            final_score=70 + index,
            dimensions=dimensions,
            type="方法",
            rejection_reason="none",
            topic_label="AI 项目",
            recommendation_reason="步骤完整，可独立理解",
        )
        for index in range(count)
    ]


def calibration_payload(*, ranks=None, window_ids=None):
    count = len(ranks) if ranks else 3
    ids = window_ids or [f"window-{index:04d}" for index in range(count)]
    rank_list = ranks or list(range(1, count + 1))
    return {
        "items": [
            {
                "windowId": ids[index],
                "recommendation": "strong",
                "finalScore": 90 - index,
                "globalRank": rank_list[index],
                "calibrationNote": f"全局第{rank_list[index]}，相对其它候选更完整",
            }
            for index in range(count)
        ]
    }


def test_calibrate_globally_forces_named_strict_tool_and_sends_cards_only():
    sdk = FakeSdk([completion(calibration_payload(), name="submit_global_calibration")])
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=sdk,
    )

    result = client.calibrate_globally(scored_candidates())

    assert [item.window_id for item in result] == [
        "window-0000",
        "window-0001",
        "window-0002",
    ]
    assert result[0].global_rank == 1
    assert result[0].recommendation == "strong"
    kwargs = sdk.completions.calls[0]
    assert kwargs["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_global_calibration"},
    }
    assert kwargs["tools"][0]["function"]["strict"] is True
    # 卡片只发压缩字段，不泄漏正文
    sent_candidate = json.loads(kwargs["messages"][1]["content"])["candidates"][0]
    assert set(sent_candidate.keys()) == {
        "windowId",
        "recommendation",
        "finalScore",
        "type",
        "topicLabel",
        "recommendationReason",
    }
    assert "text" not in sent_candidate


def test_calibrate_globally_rejects_rank_not_a_permutation():
    # rank 1,1,3 不是 1..N 的排列
    payload = calibration_payload(ranks=[1, 1, 3])
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=FakeSdk([completion(payload)] * 3),
        sleeper=lambda _: None,
    )

    with pytest.raises(DeepSeekError) as exc_info:
        client.calibrate_globally(scored_candidates())

    assert exc_info.value.code == "deepseek_invalid_response"


def test_calibrate_globally_retries_429_then_succeeds():
    sleeps = []
    sdk = FakeSdk(
        [
            FakeHttpError(429),
            completion(calibration_payload(), name="submit_global_calibration"),
        ]
    )
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=sdk,
        sleeper=sleeps.append,
    )

    result = client.calibrate_globally(scored_candidates())

    assert result[0].final_score == 90
    assert len(sdk.completions.calls) == 2
    assert sleeps == [1]


def test_calibrate_globally_rejects_missing_or_unknown_window_ids():
    payload = calibration_payload()
    payload["items"][0]["windowId"] = "window-unknown"
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=FakeSdk([completion(payload)] * 3),
        sleeper=lambda _: None,
    )

    with pytest.raises(DeepSeekError) as exc_info:
        client.calibrate_globally(scored_candidates())

    assert exc_info.value.code == "deepseek_invalid_response"
