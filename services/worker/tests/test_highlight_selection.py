from clipwise_worker.highlight_models import (
    CandidateWindow,
    ScoreDimensions,
    ScoredWindow,
)
from clipwise_worker.highlight_selection import (
    select_editor_recall_pool,
    diversify_by_topic,
)


DIMENSIONS = ScoreDimensions.model_validate(
    {
        "informationDensity": 4,
        "hookStrength": 3,
        "standaloneClarity": 4,
        "editability": 4,
    }
)


def scored(
    window_id,
    start_ms,
    end_ms,
    *,
    recommendation="recommended",
    final_score=75,
    topic_label="AI 项目",
    rejection_reason="none",
    needs_setup=False,
):
    return ScoredWindow(
        window=CandidateWindow(
            window_id=window_id,
            start_ms=start_ms,
            end_ms=end_ms,
            segment_ids=[f"{window_id}-s1", f"{window_id}-s2"],
            text=f"{window_id} text",
        ),
        recommendation=recommendation,
        final_score=final_score,
        dimensions=DIMENSIONS,
        type="方法",
        rejection_reason=rejection_reason,
        topic_label=topic_label,
        recommendation_reason="值得剪辑师查看",
        needs_setup=needs_setup,
        boundary_reason="",
    )


def test_select_pool_keeps_backup_but_rejects_hard_negative_reasons():
    selected, audits = select_editor_recall_pool(
        [
            scored("strong", 0, 120_000, recommendation="strong", final_score=88),
            scored("backup", 200_000, 320_000, recommendation="backup", final_score=58),
            scored("reject", 400_000, 520_000, recommendation="reject", final_score=90),
            scored("noise", 600_000, 720_000, recommendation="backup", final_score=80, rejection_reason="asr_noise"),
        ]
    )

    assert [item.window.window_id for item in selected] == ["strong", "backup"]
    statuses = {audit.window_id: audit.selection_status for audit in audits}
    assert statuses["reject"] == "rejected"
    assert statuses["noise"] == "rejected"


def test_select_pool_uses_seventy_percent_overlap_threshold():
    selected, audits = select_editor_recall_pool(
        [
            scored("base", 0, 100_000, recommendation="strong", final_score=90),
            scored("overlap", 29_000, 129_000, recommendation="strong", final_score=89),
        ]
    )

    assert [item.window.window_id for item in selected] == ["base"]
    assert {audit.window_id: audit.selection_status for audit in audits}["overlap"] == "time_duplicate"


def test_diversify_by_topic_prevents_single_topic_from_filling_top_thirty():
    candidates = [
        scored(f"same-{index}", index * 200_000, index * 200_000 + 120_000, topic_label="同一主题", final_score=95 - index)
        for index in range(8)
    ] + [
        scored("other-1", 2_000_000, 2_120_000, topic_label="其它主题", final_score=70),
        scored("other-2", 2_200_000, 2_320_000, topic_label="第三主题", final_score=69),
    ]

    selected, audits = diversify_by_topic(candidates, target_count=30, max_per_topic=4)

    assert [item.window.window_id for item in selected].count("same-0") == 1
    assert sum(1 for item in selected if item.topic_label == "同一主题") == 4
    assert {"other-1", "other-2"}.issubset({item.window.window_id for item in selected})
    assert {audit.window_id: audit.selection_status for audit in audits}["same-4"] == "topic_diversity_skipped"
