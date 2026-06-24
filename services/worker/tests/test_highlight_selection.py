from clipwise_worker.highlight_models import (
    CandidateWindow,
    GlobalCalibration,
    ScoreDimensions,
    ScoredWindow,
)
from clipwise_worker.highlight_selection import (
    merge_window_score_audits,
    select_editor_recall_pool,
    diversify_by_topic,
    stamp_calibration,
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


def test_stamp_calibration_survives_merge_overwrite():
    """核心缺陷回归：merge 整条覆盖后，校准字段必须靠 stamp 盖回来。"""
    calibrated_window = scored("calibrated", 0, 120_000, recommendation="recommended", final_score=70)
    uncalibrated_window = scored("plain", 200_000, 320_000, recommendation="backup", final_score=58)
    candidates = [calibrated_window, uncalibrated_window]

    # 模拟真实流水线：先产生 recall pool 审计，再产生 diversity 审计（同 window_id 整条覆盖）
    pool_audits = select_editor_recall_pool(candidates)[1]
    diversity_audits = diversify_by_topic(candidates, target_count=30)[1]

    # merge 完成时，校准字段应全是 None（被 diversity 整条覆盖了）
    merged = merge_window_score_audits(candidates, pool_audits, diversity_audits)
    assert all(audit.calibration_applied is None for audit in merged)

    calibration_by_window = {
        "calibrated": GlobalCalibration(
            windowId="calibrated",
            recommendation="strong",
            finalScore=92,
            globalRank=1,
            calibrationNote="全局最强，独立成片价值高",
        )
    }

    stamped = stamp_calibration(merged, calibration_by_window)

    by_id = {audit.window_id: audit for audit in stamped}
    # 校准字段被正确盖章，不被 merge 覆盖
    assert by_id["calibrated"].calibration_applied is True
    assert by_id["calibrated"].calibrated_recommendation == "strong"
    assert by_id["calibrated"].calibrated_final_score == 92
    assert by_id["calibrated"].global_rank == 1
    assert by_id["calibrated"].calibration_note == "全局最强，独立成片价值高"
    # 原始分数仍保留（双份记录）
    assert by_id["calibrated"].final_score == 70
    # 未校准的窗口标记为 False
    assert by_id["plain"].calibration_applied is False
    assert by_id["plain"].calibrated_recommendation is None


def test_stamp_calibration_marks_all_false_when_dict_empty():
    """reduce 跳过或降级时（dict 为空），所有窗口 calibration_applied=False。"""
    candidate = scored("only", 0, 120_000)
    merged = merge_window_score_audits(
        [candidate],
        select_editor_recall_pool([candidate])[1],
    )

    stamped = stamp_calibration(merged, {})

    assert stamped[0].calibration_applied is False
    assert stamped[0].calibrated_recommendation is None
