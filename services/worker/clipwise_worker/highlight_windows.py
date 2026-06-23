from __future__ import annotations

import re

from .highlight_models import (
    BoundaryDecision,
    CandidateWindow,
    FinalCandidateInput,
    ScoredWindow,
    TranscriptSegment,
)


def generate_candidate_windows(
    segments: list[TranscriptSegment],
    *,
    target_ms: int = 120_000,
    min_ms: int = 60_000,
    max_ms: int = 180_000,
    step_ms: int = 45_000,
) -> list[CandidateWindow]:
    if not segments:
        return []

    ordered = sorted(segments, key=lambda segment: (segment.index, segment.start_ms))
    windows: list[CandidateWindow] = []
    start_index = 0

    while start_index < len(ordered):
        start_ms = ordered[start_index].start_ms
        selected: list[TranscriptSegment] = []

        for segment in ordered[start_index:]:
            duration_ms = segment.end_ms - start_ms
            if duration_ms > max_ms:
                break
            selected.append(segment)
            if duration_ms >= target_ms:
                break

        if selected and selected[-1].end_ms - start_ms >= min_ms:
            ordinal = len(windows) + 1
            windows.append(
                CandidateWindow(
                    window_id=f"window-{ordinal:04d}",
                    start_ms=start_ms,
                    end_ms=selected[-1].end_ms,
                    segment_ids=[segment.id for segment in selected],
                    text=" ".join(
                        segment.text.strip()
                        for segment in selected
                        if segment.text.strip()
                    ),
                )
            )

        next_start_ms = start_ms + step_ms
        next_index = next(
            (
                index
                for index in range(start_index + 1, len(ordered))
                if ordered[index].start_ms >= next_start_ms
            ),
            len(ordered),
        )
        start_index = next_index

    return windows


def overlap_ratio(a: CandidateWindow, b: CandidateWindow) -> float:
    overlap_ms = max(0, min(a.end_ms, b.end_ms) - max(a.start_ms, b.start_ms))
    shorter_ms = min(a.end_ms - a.start_ms, b.end_ms - b.start_ms)
    if shorter_ms <= 0:
        return 0.0
    return overlap_ms / shorter_ms


def select_time_unique_windows(
    items: list[ScoredWindow],
    *,
    min_score: int = 60,
    max_candidates: int = 30,
) -> list[ScoredWindow]:
    ordered = sorted(
        (item for item in items if item.final_score >= min_score),
        key=lambda item: (
            -item.final_score,
            item.window.start_ms,
            item.window.window_id,
        ),
    )
    selected: list[ScoredWindow] = []
    for item in ordered:
        if any(
            overlap_ratio(item.window, existing.window) > 0.8
            for existing in selected
        ):
            continue
        selected.append(item)
        if len(selected) >= max_candidates:
            break
    return selected


def apply_boundary_decision(
    scored: ScoredWindow,
    decision: BoundaryDecision,
    segments_by_id: dict[str, TranscriptSegment],
) -> FinalCandidateInput:
    if decision.window_id != scored.window.window_id or not decision.keep:
        raise ValueError("boundary decision does not keep the scored window")

    window_ids = scored.window.segment_ids
    if (
        decision.start_segment_id not in window_ids
        or decision.end_segment_id not in window_ids
    ):
        raise ValueError("boundary segment is outside the candidate window")

    start_index = window_ids.index(decision.start_segment_id)
    end_index = window_ids.index(decision.end_segment_id)
    if start_index > end_index:
        raise ValueError("boundary start is after end")

    selected_ids = window_ids[start_index : end_index + 1]
    try:
        selected = [segments_by_id[segment_id] for segment_id in selected_ids]
    except KeyError as exc:
        raise ValueError("boundary references an unknown transcript segment") from exc

    start_ms = selected[0].start_ms
    end_ms = selected[-1].end_ms
    duration_ms = end_ms - start_ms
    if duration_ms < 60_000 or duration_ms > 180_000:
        raise ValueError("boundary duration must be between 60 and 180 seconds")

    return FinalCandidateInput(
        window_id=scored.window.window_id,
        recommendation=scored.recommendation,
        final_score=scored.final_score,
        dimensions=scored.dimensions,
        type=scored.type,
        rejection_reason=scored.rejection_reason,
        topic_label=scored.topic_label,
        recommendation_reason=scored.recommendation_reason,
        needs_setup=decision.needs_setup,
        boundary_reason=decision.boundary_reason,
        start_ms=start_ms,
        end_ms=end_ms,
        segment_ids=selected_ids,
        text=" ".join(
            segment.text.strip() for segment in selected if segment.text.strip()
        ),
    )


def normalize_plain_whitespace(value: str) -> str:
    return re.sub(r"[ \t\r\n\u3000]+", "", value)


def quote_is_verbatim(quote: str, transcript_text: str) -> bool:
    normalized_quote = normalize_plain_whitespace(quote)
    normalized_transcript = normalize_plain_whitespace(transcript_text)
    return bool(normalized_quote) and normalized_quote in normalized_transcript
