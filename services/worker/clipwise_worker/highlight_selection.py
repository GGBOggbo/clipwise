from __future__ import annotations

from collections import defaultdict

from .highlight_models import ScoredWindow, WindowScoreAudit
from .highlight_windows import overlap_ratio


RECOMMENDATION_ORDER = {"strong": 0, "recommended": 1, "backup": 2, "reject": 3}
HARD_REJECT_REASONS = {
    "small_talk",
    "transition",
    "fragmented",
    "asr_noise",
    "promotion_or_admin",
}
MIN_RECALL_SCORE = 45
TIME_OVERLAP_THRESHOLD = 0.7


def _sort_key(item: ScoredWindow):
    return (
        RECOMMENDATION_ORDER[item.recommendation],
        -item.final_score,
        item.needs_setup,
        item.window.start_ms,
        item.window.window_id,
    )


def _audit(item: ScoredWindow, status: str, reason: str, duplicate_of: str | None = None):
    return WindowScoreAudit(
        window_id=item.window.window_id,
        start_ms=item.window.start_ms,
        end_ms=item.window.end_ms,
        segment_ids=item.window.segment_ids,
        text_preview=item.window.text[:240],
        recommendation=item.recommendation,
        final_score=item.final_score,
        type=item.type,
        dimensions=item.dimensions,
        rejection_reason=item.rejection_reason,
        topic_label=item.topic_label,
        recommendation_reason=item.recommendation_reason,
        selection_status=status,
        selection_reason=reason,
        duplicate_of_window_id=duplicate_of,
    )


def select_editor_recall_pool(
    items: list[ScoredWindow],
    *,
    max_candidates: int = 60,
) -> tuple[list[ScoredWindow], list[WindowScoreAudit]]:
    selected: list[ScoredWindow] = []
    audits: list[WindowScoreAudit] = []
    for item in sorted(items, key=_sort_key):
        if item.recommendation == "reject":
            audits.append(_audit(item, "rejected", "model_recommendation_reject"))
            continue
        if item.final_score < MIN_RECALL_SCORE:
            audits.append(_audit(item, "below_recall_threshold", "final_score_below_45"))
            continue
        if item.rejection_reason in HARD_REJECT_REASONS:
            audits.append(_audit(item, "rejected", f"hard_reject_reason:{item.rejection_reason}"))
            continue
        duplicate = next(
            (
                existing
                for existing in selected
                if overlap_ratio(item.window, existing.window) > TIME_OVERLAP_THRESHOLD
            ),
            None,
        )
        if duplicate is not None:
            audits.append(_audit(item, "time_duplicate", "overlap_above_0.7", duplicate.window.window_id))
            continue
        selected.append(item)
        audits.append(_audit(item, "scored", "entered_recall_pool"))
        if len(selected) >= max_candidates:
            break
    return selected, audits


def diversify_by_topic(
    items: list[ScoredWindow],
    *,
    target_count: int = 30,
    max_per_topic: int = 4,
) -> tuple[list[ScoredWindow], list[WindowScoreAudit]]:
    buckets: dict[str, list[ScoredWindow]] = defaultdict(list)
    for item in sorted(items, key=_sort_key):
        buckets[item.topic_label].append(item)

    selected: list[ScoredWindow] = []
    selected_ids: set[str] = set()
    audits: list[WindowScoreAudit] = []

    while len(selected) < target_count:
        added = False
        for topic in sorted(buckets):
            topic_selected = [item for item in selected if item.topic_label == topic]
            if len(topic_selected) >= max_per_topic:
                continue
            next_item = next(
                (
                    item
                    for item in buckets[topic]
                    if item.window.window_id not in selected_ids
                    and item.recommendation in {"strong", "recommended"}
                ),
                None,
            )
            if next_item is None:
                continue
            selected.append(next_item)
            selected_ids.add(next_item.window.window_id)
            audits.append(_audit(next_item, "selected", "selected_by_topic_diversity"))
            added = True
            if len(selected) >= target_count:
                break
        if not added:
            break

    def _topic_count(topic: str) -> int:
        return sum(1 for existing in selected if existing.topic_label == topic)

    for item in sorted(items, key=_sort_key):
        if len(selected) >= target_count:
            break
        if item.window.window_id in selected_ids:
            continue
        if item.recommendation == "backup" and _topic_count(item.topic_label) < max_per_topic:
            selected.append(item)
            selected_ids.add(item.window.window_id)
            audits.append(_audit(item, "selected", "backup_selected_to_fill_target"))

    # 全局补齐：仍然遵守每主题上限，避免单一主题挤占多样性
    for item in sorted(items, key=_sort_key):
        if len(selected) >= target_count:
            break
        if item.window.window_id in selected_ids:
            continue
        if _topic_count(item.topic_label) >= max_per_topic:
            continue
        selected.append(item)
        selected_ids.add(item.window.window_id)
        audits.append(_audit(item, "selected", "global_backfill_without_fake_candidates"))

    for item in items:
        if item.window.window_id not in selected_ids:
            audits.append(_audit(item, "topic_diversity_skipped", "topic_soft_cap_or_rank_limit"))

    return selected, audits


def merge_window_score_audits(
    scored: list[ScoredWindow],
    *audit_groups: list[WindowScoreAudit],
) -> list[WindowScoreAudit]:
    """合并多阶段产生的审计记录：同一 window_id 取最后一条状态。

    保证每个被评分窗口都恰好有一条审计记录。
    """
    by_window: dict[str, WindowScoreAudit] = {}
    for group in audit_groups:
        for audit in group:
            by_window[audit.window_id] = audit

    # 没有任何阶段记录过的窗口补一条 scored 占位，避免审计缺失
    for item in scored:
        if item.window.window_id not in by_window:
            by_window[item.window.window_id] = _audit(item, "scored", "entered_recall_pool")

    return list(by_window.values())
