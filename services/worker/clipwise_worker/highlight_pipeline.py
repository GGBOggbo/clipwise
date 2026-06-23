from __future__ import annotations

import inspect
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
    ScoredWindow,
    TranscriptSegment,
    WindowScore,
)
from .highlight_windows import (
    apply_boundary_decision,
    generate_candidate_windows,
    quote_is_verbatim,
    select_time_unique_windows,
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

    def generate_candidate_details(
        self,
        candidates: list[FinalCandidateInput],
    ) -> list[CandidateDetail]: ...


ProgressCallback = Callable[[int, str], Awaitable[None] | None]


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
                final_score=score.final_score,
                type=score.type,
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
                    raise HighlightGenerationError(
                        "deepseek_invalid_response",
                        "保留候选不能指向重复项",
                    )
                continue
            if decision.duplicate_of not in kept_ids:
                raise HighlightGenerationError(
                    "deepseek_invalid_response",
                    "重复候选必须指向保留候选",
                )
            source = candidates_by_id[decision.window_id]
            target = candidates_by_id[decision.duplicate_of]
            if target.final_score < source.final_score:
                raise HighlightGenerationError(
                    "deepseek_invalid_response",
                    "重复候选不能指向更低分候选",
                )

        return [
            (candidate, decisions_by_id[candidate.window.window_id])
            for candidate in candidates
            if decisions_by_id[candidate.window.window_id].keep
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

    async def generate(
        self,
        project_token: str,
        progress_callback: ProgressCallback | None = None,
    ) -> list[FinalCandidate]:
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
            time_unique = select_time_unique_windows(scored)
            if not time_unique:
                raise HighlightGenerationError(
                    "no_quality_candidates",
                    "没有达到质量要求的候选片段",
                )

            await self._progress(progress_callback, 65, "正在筛选候选片段")
            decisions = self._client.select_unique_candidates(time_unique)
            kept = self._validate_selection(time_unique, decisions)
            segments_by_id = {segment.id: segment for segment in segments}
            bounded = [
                apply_boundary_decision(candidate, decision, segments_by_id)
                for candidate, decision in kept
            ]
            bounded.sort(
                key=lambda item: (-item.final_score, item.start_ms, item.window_id)
            )
            bounded = bounded[:10]

            await self._progress(progress_callback, 85, "正在生成候选片段")
            details = self._validate_details(
                bounded,
                self._client.generate_candidate_details(bounded),
            )

            final: list[FinalCandidate] = []
            for rank, candidate in enumerate(bounded, start=1):
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
                        final_score=candidate.final_score,
                        type=candidate.type,
                        start_ms=candidate.start_ms,
                        end_ms=candidate.end_ms,
                        title_options=detail.title_options,
                        selected_title=detail.title_options[0],
                        summary=detail.summary,
                        quote=detail.quote,
                        recommendation_reason=candidate.recommendation_reason,
                        risk_notices=detail.risk_notices,
                        subtitles=subtitles,
                    )
                )
            return final
        except HighlightGenerationError:
            raise
        except DeepSeekError as exc:
            raise HighlightGenerationError(
                exc.code,
                "AI 分析失败，请重试",
            ) from exc
