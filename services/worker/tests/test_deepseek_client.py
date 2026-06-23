import json
from types import SimpleNamespace

import pytest

from clipwise_worker.config import WorkerConfig
from clipwise_worker.deepseek import DeepSeekClient, DeepSeekError
from clipwise_worker.highlight_models import CandidateWindow


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
