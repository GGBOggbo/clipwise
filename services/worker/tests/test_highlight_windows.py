import pytest

from clipwise_worker.highlight_models import (
    BoundaryDecision,
    CandidateWindow,
    ScoreDimensions,
    ScoredWindow,
    TranscriptSegment,
)
from clipwise_worker.highlight_windows import (
    apply_boundary_decision,
    generate_candidate_windows,
    overlap_ratio,
    quote_is_verbatim,
    select_time_unique_windows,
)


DIMENSIONS = ScoreDimensions.model_validate(
    {
        "informationDensity": 4,
        "hookStrength": 3,
        "standaloneClarity": 4,
        "editability": 4,
    }
)


def make_segments(count: int, duration_ms: int = 15_000):
    return [
        TranscriptSegment(
            id=f"segment-{index}",
            index=index,
            start_ms=index * duration_ms,
            end_ms=(index + 1) * duration_ms,
            text=f"第{index}句",
        )
        for index in range(count)
    ]


def make_scored(
    window_id: str,
    start_ms: int,
    end_ms: int,
    score: int,
) -> ScoredWindow:
    return ScoredWindow(
        window=CandidateWindow(
            window_id=window_id,
            start_ms=start_ms,
            end_ms=end_ms,
            segment_ids=[f"{window_id}-start", f"{window_id}-end"],
            text=window_id,
        ),
        recommendation="recommended",
        final_score=score,
        dimensions=DIMENSIONS,
        type="观点",
        rejection_reason="none",
        topic_label="测试主题",
        recommendation_reason="完整观点",
    )


def test_generate_windows_aligns_to_segments_and_editor_recall_duration():
    segments = make_segments(12)

    windows = generate_candidate_windows(segments)

    assert windows[0].start_ms == segments[0].start_ms
    assert windows[0].end_ms == segments[7].end_ms
    assert windows[0].segment_ids == [segment.id for segment in segments[:8]]
    assert windows[1].start_ms == segments[3].start_ms
    assert all(60_000 <= window.end_ms - window.start_ms <= 180_000 for window in windows)


def test_generate_windows_returns_empty_for_empty_or_short_transcript():
    assert generate_candidate_windows([]) == []
    # 60s 下限：4 个 15s 段恰好 60s，刚好达到 editor recall 最短窗口
    assert len(generate_candidate_windows(make_segments(4))) >= 1
    assert generate_candidate_windows(make_segments(2)) == []


def test_generate_windows_uses_last_complete_tail_window():
    windows = generate_candidate_windows(make_segments(12))

    # 最后一个窗口从 segment-6(90s) 起，吞掉剩余所有段到 180s（未达 120s 目标但达 min）
    assert windows[-1].start_ms == 90_000
    assert windows[-1].end_ms == 180_000
    assert windows[-1].segment_ids == [
        "segment-6",
        "segment-7",
        "segment-8",
        "segment-9",
        "segment-10",
        "segment-11",
    ]


def test_generate_windows_respects_real_segment_gaps():
    segments = make_segments(8)
    segments[5] = segments[5].model_copy(
        update={"start_ms": 95_000, "end_ms": 110_000}
    )
    segments[6] = segments[6].model_copy(
        update={"start_ms": 110_000, "end_ms": 125_000}
    )
    segments[7] = segments[7].model_copy(
        update={"start_ms": 125_000, "end_ms": 140_000}
    )

    windows = generate_candidate_windows(segments)

    assert windows[0].start_ms == 0
    assert windows[0].end_ms == 125_000


def test_overlap_ratio_uses_shorter_window_and_keeps_exactly_eighty_percent():
    base = make_scored("base", 0, 100_000, 90).window
    exact = make_scored("exact", 20_000, 120_000, 80).window
    over = make_scored("over", 19_000, 119_000, 70).window

    assert overlap_ratio(base, exact) == pytest.approx(0.8)
    assert overlap_ratio(base, over) == pytest.approx(0.81)


def test_selection_filters_low_scores_and_removes_more_than_eighty_percent_overlap():
    selected = select_time_unique_windows(
        [
            make_scored("window-low", 300_000, 390_000, 59),
            make_scored("window-highest", 0, 100_000, 95),
            make_scored("window-overlap", 10_000, 100_000, 90),
            make_scored("window-non-overlap", 200_000, 290_000, 80),
        ]
    )

    assert [item.window.window_id for item in selected] == [
        "window-highest",
        "window-non-overlap",
    ]


def test_selection_is_stable_for_equal_scores_and_honors_limit():
    selected = select_time_unique_windows(
        [
            make_scored("window-b", 200_000, 290_000, 80),
            make_scored("window-a", 0, 90_000, 80),
            make_scored("window-c", 400_000, 490_000, 80),
        ],
        max_candidates=2,
    )

    assert [item.window.window_id for item in selected] == [
        "window-a",
        "window-b",
    ]


def test_apply_boundary_decision_maps_only_real_segments_inside_window():
    segments = make_segments(8)
    scored = ScoredWindow(
        window=CandidateWindow(
            window_id="window-0001",
            start_ms=0,
            end_ms=120_000,
            segment_ids=[segment.id for segment in segments],
            text=" ".join(segment.text for segment in segments),
        ),
        recommendation="recommended",
        final_score=88,
        dimensions=DIMENSIONS,
        type="方法",
        rejection_reason="none",
        topic_label="测试主题",
        recommendation_reason="步骤完整",
        needs_setup=False,
        boundary_reason="",
    )
    decision = BoundaryDecision.model_validate(
        {
            "windowId": "window-0001",
            "keep": True,
            "duplicateOf": None,
            "startSegmentId": "segment-1",
            "endSegmentId": "segment-5",
            "boundaryReason": "覆盖完整观点",
            "needsSetup": False,
        }
    )

    result = apply_boundary_decision(
        scored,
        decision,
        {segment.id: segment for segment in segments},
    )

    assert result.start_ms == 15_000
    assert result.end_ms == 90_000
    assert result.segment_ids == [
        "segment-1",
        "segment-2",
        "segment-3",
        "segment-4",
        "segment-5",
    ]
    assert result.text == "第1句 第2句 第3句 第4句 第5句"
    assert result.boundary_reason == "覆盖完整观点"
    assert result.needs_setup is False


@pytest.mark.parametrize(
    ("start_id", "end_id"),
    [
        ("missing", "segment-5"),
        ("segment-5", "segment-1"),
        ("segment-0", "segment-2"),
        ("segment-0", "segment-7"),
    ],
)
def test_apply_boundary_decision_rejects_invalid_or_out_of_range_boundaries(
    start_id,
    end_id,
):
    segments = make_segments(8)
    scored = ScoredWindow(
        window=CandidateWindow(
            window_id="window-0001",
            start_ms=15_000,
            end_ms=105_000,
            segment_ids=[segment.id for segment in segments[1:7]],
            text="范围内文本",
        ),
        recommendation="recommended",
        final_score=88,
        dimensions=DIMENSIONS,
        type="方法",
        rejection_reason="none",
        topic_label="测试主题",
        recommendation_reason="步骤完整",
        needs_setup=False,
        boundary_reason="",
    )
    decision = BoundaryDecision.model_validate(
        {
            "windowId": "window-0001",
            "keep": True,
            "duplicateOf": None,
            "startSegmentId": start_id,
            "endSegmentId": end_id,
            "boundaryReason": "边界",
            "needsSetup": False,
        }
    )

    with pytest.raises(ValueError):
        apply_boundary_decision(
            scored,
            decision,
            {segment.id: segment for segment in segments},
        )


def test_quote_is_verbatim_ignores_only_plain_whitespace():
    transcript = "不是模型不够强，\n而是你没想清楚用户为什么要用。"

    assert quote_is_verbatim(
        "不是模型不够强，而是你没想清楚用户为什么要用。",
        transcript,
    )
    assert not quote_is_verbatim(
        "不是模型不够强；而是你没想清楚用户为什么要用。",
        transcript,
    )
    assert not quote_is_verbatim("", transcript)
