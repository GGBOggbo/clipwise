from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable
from typing import Protocol

from .db import Database
from .deepseek import DeepSeekError
from .highlight_models import (
    BoundaryDecision,
    CandidateDetail,
    CandidateWindow,
    FinalCandidate,
    FinalCandidateInput,
    FinalSubtitle,
    GlobalCalibration,
    HighlightPipelineResult,
    ScoredWindow,
    TranscriptSegment,
    WindowScore,
)
from .highlight_selection import (
    diversify_by_topic,
    merge_window_score_audits,
    select_editor_recall_pool,
    stamp_calibration,
)
from .highlight_windows import (
    apply_boundary_decision,
    generate_candidate_windows,
    quote_is_verbatim,
)


class HighlightClient(Protocol):
    def score_windows(
        self,
        windows: list[CandidateWindow],
    ) -> list[WindowScore]: ...

    def select_unique_candidates(
        self,
        candidates: list[ScoredWindow],
    ) -> list[BoundaryDecision]: ...

    def calibrate_globally(
        self,
        candidates: list[ScoredWindow],
    ) -> list[GlobalCalibration]: ...

    def generate_candidate_details(
        self,
        candidates: list[FinalCandidateInput],
    ) -> list[CandidateDetail]: ...


ProgressCallback = Callable[[int, str], Awaitable[None] | None]

logger = logging.getLogger(__name__)

# 候选太少时跳过全局校准轮：拿不到相对判断的收益，不值得多一次调用。
CALIBRATION_MIN_CANDIDATES = 12


class HighlightGenerationError(RuntimeError):
    def __init__(self, code: str, user_message: str):
        super().__init__(user_message)
        self.code = code
        self.user_message = user_message


async def read_transcript(
    database: Database,
    project_token: str,
) -> list[TranscriptSegment]:
    async with database.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, index, start_ms, end_ms, text "
            "FROM transcript_segments "
            "WHERE project_token = $1 "
            "ORDER BY index ASC, start_ms ASC",
            project_token,
        )
    return [
        TranscriptSegment(
            id=row["id"],
            index=row["index"],
            start_ms=row["start_ms"],
            end_ms=row["end_ms"],
            text=row["text"],
        )
        for row in rows
    ]


class HighlightPipeline:
    def __init__(
        self,
        database: Database,
        client: HighlightClient,
    ) -> None:
        self._db = database
        self._client = client

    async def _progress(
        self,
        callback: ProgressCallback | None,
        progress: int,
        message: str,
    ) -> None:
        if callback is None:
            return
        result = callback(progress, message)
        if inspect.isawaitable(result):
            await result

    @staticmethod
    def _score_windows(
        windows: list[CandidateWindow],
        scores: list[WindowScore],
    ) -> list[ScoredWindow]:
        windows_by_id = {window.window_id: window for window in windows}
        actual_ids = [score.window_id for score in scores]
        if len(actual_ids) != len(set(actual_ids)) or set(actual_ids) != set(
            windows_by_id
        ):
            raise HighlightGenerationError(
                "deepseek_invalid_response",
                "候选评分结果不完整",
            )
        return [
            ScoredWindow(
                window=windows_by_id[score.window_id],
                recommendation=score.recommendation,
                final_score=score.final_score,
                dimensions=score.dimensions,
                type=score.type,
                rejection_reason=score.rejection_reason,
                topic_label=score.topic_label,
                recommendation_reason=score.recommendation_reason,
            )
            for score in scores
        ]

    @staticmethod
    def _validate_selection(
        candidates: list[ScoredWindow],
        decisions: list[BoundaryDecision],
    ) -> list[tuple[ScoredWindow, BoundaryDecision]]:
        candidates_by_id = {
            candidate.window.window_id: candidate for candidate in candidates
        }
        decision_ids = [decision.window_id for decision in decisions]
        if len(decision_ids) != len(set(decision_ids)) or set(decision_ids) != set(
            candidates_by_id
        ):
            raise HighlightGenerationError(
                "deepseek_invalid_response",
                "语义去重结果不完整",
            )

        decisions_by_id = {
            decision.window_id: decision for decision in decisions
        }
        normalized_decisions = dict(decisions_by_id)
        kept_ids = {
            decision.window_id for decision in decisions if decision.keep
        }
        if not kept_ids:
            raise HighlightGenerationError(
                "no_quality_candidates",
                "没有达到质量要求的候选片段",
            )

        for decision in decisions:
            if decision.keep:
                if decision.duplicate_of is not None:
                    normalized_decisions[decision.window_id] = decision.model_copy(
                        update={
                            "duplicate_of": None,
                        }
                    )
                continue
            if decision.duplicate_of not in kept_ids:
                normalized_decisions[decision.window_id] = decision.model_copy(
                    update={
                        "keep": True,
                        "duplicate_of": None,
                    }
                )
                kept_ids.add(decision.window_id)
                continue
            source = candidates_by_id[decision.window_id]
            target = candidates_by_id[decision.duplicate_of]
            if target.final_score < source.final_score:
                normalized_decisions[decision.window_id] = decision.model_copy(
                    update={
                        "keep": True,
                        "duplicate_of": None,
                    }
                )
                kept_ids.add(decision.window_id)
                if not any(
                    other.window_id != decision.window_id
                    and not other.keep
                    and other.duplicate_of == decision.duplicate_of
                    for other in decisions
                ):
                    kept_ids.discard(decision.duplicate_of)

        return [
            (candidate, normalized_decisions[candidate.window.window_id])
            for candidate in candidates
            if candidate.window.window_id in kept_ids
        ]

    @staticmethod
    def _validate_details(
        candidates: list[FinalCandidateInput],
        details: list[CandidateDetail],
    ) -> dict[str, CandidateDetail]:
        expected_ids = {candidate.window_id for candidate in candidates}
        actual_ids = [detail.window_id for detail in details]
        if len(actual_ids) != len(set(actual_ids)) or set(actual_ids) != expected_ids:
            raise HighlightGenerationError(
                "deepseek_invalid_response",
                "候选详情结果不完整",
            )
        details_by_id = {detail.window_id: detail for detail in details}
        for candidate in candidates:
            detail = details_by_id[candidate.window_id]
            if not detail.summary.strip() or not quote_is_verbatim(
                detail.quote,
                candidate.text,
            ):
                raise HighlightGenerationError(
                    "deepseek_invalid_response",
                    "候选详情包含空摘要或非原文金句",
                )
        return details_by_id

    def _run_calibration(
        self,
        recall_pool: list[ScoredWindow],
    ) -> tuple[list[ScoredWindow], dict[str, GlobalCalibration]]:
        """全局校准轮(reduce)：只看压缩卡片，做跨批重排与档位校准。

        候选过少时跳过；调用失败则降级用原始分数继续，审计会标记
        calibration_applied=False。返回 (覆盖校准值后的 recall_pool, 校准字典)。
        """
        if len(recall_pool) <= CALIBRATION_MIN_CANDIDATES:
            return recall_pool, {}

        try:
            calibration = self._validate_calibration(
                recall_pool,
                self._client.calibrate_globally(recall_pool),
            )
        except (DeepSeekError, HighlightGenerationError) as exc:
            logger.warning(
                "全局校准失败，降级使用原始分数: %s", exc, exc_info=True
            )
            return recall_pool, {}

        calibration_by_window = {
            item.window_id: item for item in calibration
        }
        calibrated = self._apply_calibration(recall_pool, calibration_by_window)
        return calibrated, calibration_by_window

    @staticmethod
    def _validate_calibration(
        candidates: list[ScoredWindow],
        calibration: list[GlobalCalibration],
    ) -> list[GlobalCalibration]:
        candidate_ids = {
            candidate.window.window_id for candidate in candidates
        }
        actual_ids = [item.window_id for item in calibration]
        if len(actual_ids) != len(set(actual_ids)) or set(actual_ids) != candidate_ids:
            raise HighlightGenerationError(
                "deepseek_invalid_response",
                "全局校准结果不完整",
            )
        ranks = sorted(item.global_rank for item in calibration)
        if ranks != list(range(1, len(candidates) + 1)):
            raise HighlightGenerationError(
                "deepseek_invalid_response",
                "全局校准 globalRank 不是 1 到 N 的排列",
            )
        return calibration

    @staticmethod
    def _apply_calibration(
        recall_pool: list[ScoredWindow],
        calibration_by_window: dict[str, GlobalCalibration],
    ) -> list[ScoredWindow]:
        """用校准值覆盖 recommendation/final_score，其余字段（含 window）不变。"""
        return [
            candidate.model_copy(
                update={
                    "recommendation": calibration_by_window[
                        candidate.window.window_id
                    ].recommendation,
                    "final_score": calibration_by_window[
                        candidate.window.window_id
                    ].final_score,
                }
            )
            for candidate in recall_pool
        ]

    async def generate(
        self,
        project_token: str,
        progress_callback: ProgressCallback | None = None,
    ) -> HighlightPipelineResult:
        try:
            await self._progress(progress_callback, 10, "正在读取转写")
            segments = await read_transcript(self._db, project_token)
            if not segments:
                raise HighlightGenerationError(
                    "no_transcript",
                    "未找到可分析的转写内容",
                )

            await self._progress(progress_callback, 20, "正在生成候选窗口")
            windows = generate_candidate_windows(segments)
            if not windows:
                raise HighlightGenerationError(
                    "no_quality_candidates",
                    "转写内容不足以生成完整候选",
                )

            await self._progress(progress_callback, 30, "正在分析内容")
            scored = self._score_windows(
                windows,
                self._client.score_windows(windows),
            )
            recall_pool, pool_audits = select_editor_recall_pool(scored)
            if not recall_pool:
                raise HighlightGenerationError(
                    "no_quality_candidates",
                    "没有达到召回要求的候选片段",
                )

            recall_pool, calibration_by_window = self._run_calibration(recall_pool)

            await self._progress(progress_callback, 65, "正在筛选候选片段")
            decisions = self._client.select_unique_candidates(recall_pool)
            kept = self._validate_selection(recall_pool, decisions)
            segments_by_id = {segment.id: segment for segment in segments}
            bounded = [
                self._apply_boundary_or_fallback(
                    candidate,
                    decision,
                    segments_by_id,
                )
                for candidate, decision in kept
            ]
            diverse, diversity_audits = diversify_by_topic(
                [self._candidate_input_to_scored(item) for item in bounded],
                target_count=30,
            )

            if not diverse:
                raise HighlightGenerationError(
                    "no_quality_candidates",
                    "没有达到召回要求的候选片段",
                )

            # 按推荐档位感知顺序排序，并赋 rank 1..N
            diverse.sort(
                key=lambda item: (
                    {"strong": 0, "recommended": 1, "backup": 2, "reject": 3}[
                        item.recommendation
                    ],
                    -item.final_score,
                    item.window.start_ms,
                    item.window.window_id,
                )
            )
            bounded_by_id = {item.window_id: item for item in bounded}

            await self._progress(progress_callback, 85, "正在生成候选片段")
            details = self._validate_details(
                [bounded_by_id[item.window.window_id] for item in diverse],
                self._client.generate_candidate_details(
                    [bounded_by_id[item.window.window_id] for item in diverse]
                ),
            )

            final: list[FinalCandidate] = []
            for rank, item in enumerate(diverse, start=1):
                candidate = bounded_by_id[item.window.window_id]
                detail = details[candidate.window_id]
                subtitles = [
                    FinalSubtitle(
                        start_ms=segments_by_id[segment_id].start_ms,
                        end_ms=segments_by_id[segment_id].end_ms,
                        text=segments_by_id[segment_id].text,
                    )
                    for segment_id in candidate.segment_ids
                ]
                final.append(
                    FinalCandidate(
                        rank=rank,
                        recommendation=candidate.recommendation,
                        final_score=candidate.final_score,
                        dimensions=candidate.dimensions,
                        type=candidate.type,
                        rejection_reason=candidate.rejection_reason,
                        topic_label=candidate.topic_label,
                        start_ms=candidate.start_ms,
                        end_ms=candidate.end_ms,
                        title_options=detail.title_options,
                        selected_title=detail.title_options[0],
                        summary=detail.summary,
                        quote=detail.quote,
                        recommendation_reason=candidate.recommendation_reason,
                        editing_note=detail.editing_note,
                        boundary_reason=candidate.boundary_reason,
                        needs_setup=candidate.needs_setup,
                        risk_notices=detail.risk_notices,
                        subtitles=subtitles,
                    )
                )
            return HighlightPipelineResult(
                candidates=final,
                window_scores=stamp_calibration(
                    merge_window_score_audits(
                        scored, pool_audits, diversity_audits
                    ),
                    calibration_by_window,
                ),
            )
        except HighlightGenerationError:
            raise
        except DeepSeekError as exc:
            raise HighlightGenerationError(
                exc.code,
                "AI 分析失败，请重试",
            ) from exc

    @staticmethod
    def _apply_boundary_or_fallback(
        candidate: ScoredWindow,
        decision: BoundaryDecision,
        segments_by_id: dict[str, TranscriptSegment],
    ) -> FinalCandidateInput:
        try:
            return apply_boundary_decision(candidate, decision, segments_by_id)
        except ValueError:
            fallback = decision.model_copy(
                update={
                    "start_segment_id": candidate.window.segment_ids[0],
                    "end_segment_id": candidate.window.segment_ids[-1],
                    "boundary_reason": "模型边界无效，回退到原始候选窗口",
                }
            )
            return apply_boundary_decision(candidate, fallback, segments_by_id)

    @staticmethod
    def _candidate_input_to_scored(
        item: FinalCandidateInput,
    ) -> ScoredWindow:
        """把边界裁剪后的候选转回 ScoredWindow，供主题分散使用。"""
        return ScoredWindow(
            window=CandidateWindow(
                window_id=item.window_id,
                start_ms=item.start_ms,
                end_ms=item.end_ms,
                segment_ids=item.segment_ids,
                text=item.text,
            ),
            recommendation=item.recommendation,
            final_score=item.final_score,
            dimensions=item.dimensions,
            type=item.type,
            rejection_reason=item.rejection_reason,
            topic_label=item.topic_label,
            recommendation_reason=item.recommendation_reason,
            needs_setup=item.needs_setup,
            boundary_reason=item.boundary_reason,
        )
