from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import ValidationError

from .highlight_models import (
    BoundaryDecision,
    CalibrationResponse,
    CandidateDetail,
    CandidateWindow,
    DetailBatchResponse,
    FinalCandidateInput,
    GlobalCalibration,
    ScoreBatchResponse,
    ScoredWindow,
    SelectionResponse,
    StrictModel,
    WindowScore,
    build_strict_tool_schema,
)
from .highlight_windows import quote_is_verbatim


ResponseModel = TypeVar("ResponseModel", bound=StrictModel)


class DeepSeekError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.retryable = retryable


class DeepSeekClient:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        *,
        sdk_client: Any | None = None,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        if not api_key:
            raise DeepSeekError(
                "missing_deepseek_key",
                retryable=False,
                message="DEEPSEEK_API_KEY 未配置",
            )
        self._client = sdk_client or OpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._sleeper = sleeper

    def _parse_tool_response(
        self,
        response: Any,
        *,
        function_name: str,
        response_model: type[ResponseModel],
    ) -> ResponseModel:
        try:
            choices = response.choices
            if len(choices) != 1:
                raise ValueError("expected exactly one choice")
            choice = choices[0]
            if choice.finish_reason != "tool_calls":
                raise ValueError("completion did not finish with a tool call")
            tool_calls = choice.message.tool_calls or []
            if len(tool_calls) != 1:
                raise ValueError("expected exactly one tool call")
            tool = tool_calls[0]
            if tool.type != "function" or tool.function.name != function_name:
                raise ValueError("unexpected tool function")
            return response_model.model_validate_json(tool.function.arguments)
        except (AttributeError, TypeError, ValueError, ValidationError) as exc:
            raise DeepSeekError(
                "deepseek_invalid_response",
                retryable=True,
                message=str(exc),
            ) from exc

    def _call_strict_tool(
        self,
        *,
        function_name: str,
        description: str,
        response_model: type[ResponseModel],
        system_prompt: str,
        payload: dict[str, Any],
    ) -> ResponseModel:
        tool = build_strict_tool_schema(
            response_model,
            function_name,
            description,
        )
        for attempt in range(3):
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": json.dumps(payload, ensure_ascii=False),
                        },
                    ],
                    tools=[tool],
                    tool_choice={
                        "type": "function",
                        "function": {"name": function_name},
                    },
                    temperature=0,
                    extra_body={"thinking": {"type": "disabled"}},
                )
                return self._parse_tool_response(
                    response,
                    function_name=function_name,
                    response_model=response_model,
                )
            except DeepSeekError as exc:
                error = exc
            except Exception as exc:
                status_code = getattr(exc, "status_code", None)
                retryable = status_code in {408, 429} or (
                    isinstance(status_code, int) and status_code >= 500
                )
                error = DeepSeekError(
                    "deepseek_request_failed",
                    retryable=retryable,
                    message=str(exc),
                )

            if not error.retryable or attempt == 2:
                raise error
            self._sleeper(2**attempt)

        raise DeepSeekError("deepseek_request_failed", retryable=False)

    @staticmethod
    def _validate_exact_ids(expected_ids: list[str], actual_ids: list[str]) -> None:
        if len(actual_ids) != len(set(actual_ids)):
            raise DeepSeekError(
                "deepseek_invalid_response",
                retryable=True,
                message="模型返回了重复 ID",
            )
        if set(actual_ids) != set(expected_ids):
            raise DeepSeekError(
                "deepseek_invalid_response",
                retryable=True,
                message="模型返回的 ID 集合与输入不一致",
            )

    def score_windows(
        self,
        windows: list[CandidateWindow],
    ) -> list[WindowScore]:
        results: list[WindowScore] = []
        for start in range(0, len(windows), 12):
            batch = windows[start : start + 12]
            expected_ids = [window.window_id for window in batch]

            for attempt in range(3):
                response = self._call_strict_tool(
                    function_name="submit_window_scores",
                    description="提交每个知识直播候选窗口的编辑师召回评分结果",
                    response_model=ScoreBatchResponse,
                    system_prompt=(
                        "你是服务剪辑师的直播回放素材筛选助手。你的任务不是判断最终爆款，"
                        "而是判断这段是否值得剪辑师点开看一眼，并且是否有机会剪成一条"
                        "1到3分钟的独立短视频。逐个评估输入窗口，不得遗漏、增加或改写"
                        "windowId。输出 recommendation: strong/recommended/backup/reject，"
                        "finalScore 仅用于同档排序。按 informationDensity、hookStrength、"
                        "standaloneClarity、editability 四个1到5分维度评分。纯寒暄、过渡、"
                        "重复、行政信息、ASR噪声必须 reject；有潜力但需要补上下文的内容"
                        "可标为 backup。topicLabel 要短、稳定、适合主题分散。"
                    ),
                    payload={
                        "windows": [
                            {
                                "windowId": window.window_id,
                                "startMs": window.start_ms,
                                "endMs": window.end_ms,
                                "text": window.text,
                            }
                            for window in batch
                        ]
                    },
                )
                try:
                    self._validate_exact_ids(
                        expected_ids,
                        [item.window_id for item in response.items],
                    )
                except DeepSeekError:
                    if attempt == 2:
                        raise
                    self._sleeper(2**attempt)
                    continue
                results.extend(response.items)
                break
        return results

    def select_unique_candidates(
        self,
        candidates: list[ScoredWindow],
    ) -> list[BoundaryDecision]:
        expected_ids = [candidate.window.window_id for candidate in candidates]
        response = self._call_strict_tool(
            function_name="submit_candidate_selection",
            description="提交候选语义去重和边界选择结果",
            response_model=SelectionResponse,
            system_prompt=(
                "识别表达同一知识单元的重复候选，并保留分数不低的候选。"
                "每个输入 windowId 必须恰好返回一次。边界只能引用该候选"
                "提供的 segmentIds，不得创造时间或 ID。对每个保留候选给出"
                "boundaryReason（为什么这样切边界）和 needsSetup（是否需要"
                "剪辑师补开场或上下文）。"
            ),
            payload={
                "candidates": [
                    {
                        "windowId": item.window.window_id,
                        "recommendation": item.recommendation,
                        "finalScore": item.final_score,
                        "type": item.type,
                        "rejectionReason": item.rejection_reason,
                        "topicLabel": item.topic_label,
                        "recommendationReason": item.recommendation_reason,
                        "needsSetup": item.needs_setup,
                        "segmentIds": item.window.segment_ids,
                        "text": item.window.text,
                    }
                    for item in candidates
                ]
            },
        )
        self._validate_exact_ids(
            expected_ids,
            [item.window_id for item in response.items],
        )
        return response.items

    def calibrate_globally(
        self,
        candidates: list[ScoredWindow],
    ) -> list[GlobalCalibration]:
        expected_ids = [candidate.window.window_id for candidate in candidates]
        response = self._call_strict_tool(
            function_name="submit_global_calibration",
            description="提交同一场直播所有候选的全局校准结果",
            response_model=CalibrationResponse,
            system_prompt=(
                "你拿到的是同一场直播全部候选的评分卡，不是正文。任务是在"
                "全局视野下做相对判断：重新给出全局排序(globalRank 越小越靠前)、"
                "校准档位(strong 是否被某一批发滥了)、修正跨批分数不可比。"
                "只基于卡片字段判断，不得编造卡片外的信息。每个输入 windowId "
                "必须恰好返回一次，globalRank 必须是 1 到 N 的排列，不得重复"
                "或跳号。calibrationNote 用一句话说明相对其它候选的取舍理由。"
            ),
            payload={
                "candidates": [
                    {
                        "windowId": item.window.window_id,
                        "recommendation": item.recommendation,
                        "finalScore": item.final_score,
                        "type": item.type,
                        "topicLabel": item.topic_label,
                        "recommendationReason": item.recommendation_reason,
                    }
                    for item in candidates
                ]
            },
        )
        self._validate_exact_ids(
            expected_ids,
            [item.window_id for item in response.items],
        )
        ranks = sorted(item.global_rank for item in response.items)
        expected_ranks = list(range(1, len(candidates) + 1))
        if ranks != expected_ranks:
            raise DeepSeekError(
                "deepseek_invalid_response",
                retryable=True,
                message="globalRank 不是 1 到 N 的排列",
            )
        return response.items

    def generate_candidate_details(
        self,
        candidates: list[FinalCandidateInput],
    ) -> list[CandidateDetail]:
        results: list[CandidateDetail] = []
        for start in range(0, len(candidates), 5):
            batch = candidates[start : start + 5]
            expected_ids = [candidate.window_id for candidate in batch]
            for attempt in range(3):
                response = self._call_strict_tool(
                    function_name="submit_candidate_details",
                    description="提交最终高光候选的标题、摘要、原文金句、剪辑建议和风险提示",
                    response_model=DetailBatchResponse,
                    system_prompt=(
                        "为每个最终剪辑素材生成三个忠于原文的中文标题、摘要、逐字原文金句、"
                        "剪辑师 editingNote 和风险提示。quote 必须是输入 text 中连续出现的原文，"
                        "不得润色、拼接或添加信息。editingNote 是给剪辑师的处理建议，"
                        "不得伪造 transcript 中不存在的事实。不得遗漏或增加 ID。"
                    ),
                    payload={
                        "candidates": [
                            {
                                "windowId": candidate.window_id,
                                "type": candidate.type,
                                "finalScore": candidate.final_score,
                                "text": candidate.text,
                            }
                            for candidate in batch
                        ]
                    },
                )
                self._validate_exact_ids(
                    expected_ids,
                    [item.window_id for item in response.items],
                )
                inputs_by_id = {
                    candidate.window_id: candidate for candidate in batch
                }
                details_are_valid = all(
                    item.summary.strip()
                    and quote_is_verbatim(
                        item.quote,
                        inputs_by_id[item.window_id].text,
                    )
                    for item in response.items
                )
                if details_are_valid:
                    results.extend(response.items)
                    break
                if attempt == 2:
                    raise DeepSeekError(
                        "deepseek_invalid_response",
                        retryable=False,
                        message="候选详情包含空摘要或非原文金句",
                    )
                self._sleeper(2**attempt)
        return results
