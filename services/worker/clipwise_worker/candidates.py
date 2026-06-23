from __future__ import annotations

import uuid

from .db import Database
from .highlight_models import FinalCandidate, WindowScoreAudit


async def replace_project_candidates(
    database: Database,
    project_token: str,
    candidates: list[FinalCandidate],
    window_scores: list[WindowScoreAudit],
) -> None:
    async with database.pool.acquire() as conn:
        async with conn.transaction():
            # 同事务删除旧候选 + 旧窗口评分，避免失败时残留假数据
            await conn.execute(
                "DELETE FROM highlight_window_scores WHERE project_token = $1",
                project_token,
            )
            await conn.execute(
                "DELETE FROM clip_candidates WHERE project_token = $1",
                project_token,
            )

            for candidate in candidates:
                candidate_id = f"{project_token}-{uuid.uuid4()}"
                await conn.execute(
                    """
                    INSERT INTO clip_candidates (
                        id, project_token, rank, final_score, type,
                        start_ms, end_ms, duration_ms,
                        title_options, selected_title, summary, quote,
                        recommendation_reason, risk_notices, preview_status,
                        recommendation, topic_label, editing_note,
                        boundary_reason, needs_setup, rejection_reason
                    ) VALUES (
                        $1, $2, $3, $4, $5,
                        $6, $7, $8,
                        $9, $10, $11, $12,
                        $13, $14, 'not_previewed',
                        $15, $16, $17,
                        $18, $19, $20
                    )
                    """,
                    candidate_id,
                    project_token,
                    candidate.rank,
                    candidate.final_score,
                    candidate.type,
                    candidate.start_ms,
                    candidate.end_ms,
                    candidate.end_ms - candidate.start_ms,
                    candidate.title_options,
                    candidate.selected_title,
                    candidate.summary,
                    candidate.quote,
                    candidate.recommendation_reason,
                    candidate.risk_notices,
                    candidate.recommendation,
                    candidate.topic_label,
                    candidate.editing_note,
                    candidate.boundary_reason,
                    candidate.needs_setup,
                    candidate.rejection_reason,
                )

                for index, subtitle in enumerate(candidate.subtitles):
                    await conn.execute(
                        """
                        INSERT INTO subtitle_lines (
                            id, candidate_id, index, start_ms, end_ms, text
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        str(uuid.uuid4()),
                        candidate_id,
                        index,
                        subtitle.start_ms,
                        subtitle.end_ms,
                        subtitle.text,
                    )

            for audit in window_scores:
                await conn.execute(
                    """
                    INSERT INTO highlight_window_scores (
                        id, project_token, window_id, start_ms, end_ms,
                        duration_ms, segment_ids, text_preview, recommendation,
                        final_score, type, information_density, hook_strength,
                        standalone_clarity, editability, rejection_reason,
                        topic_label, recommendation_reason, selection_status,
                        selection_reason, duplicate_of_window_id
                    ) VALUES (
                        $1, $2, $3, $4, $5,
                        $6, $7, $8, $9,
                        $10, $11, $12, $13,
                        $14, $15, $16,
                        $17, $18, $19,
                        $20, $21
                    )
                    """,
                    str(uuid.uuid4()),
                    project_token,
                    audit.window_id,
                    audit.start_ms,
                    audit.end_ms,
                    audit.end_ms - audit.start_ms,
                    audit.segment_ids,
                    audit.text_preview,
                    audit.recommendation,
                    audit.final_score,
                    audit.type,
                    audit.dimensions.information_density,
                    audit.dimensions.hook_strength,
                    audit.dimensions.standalone_clarity,
                    audit.dimensions.editability,
                    audit.rejection_reason,
                    audit.topic_label,
                    audit.recommendation_reason,
                    audit.selection_status,
                    audit.selection_reason,
                    audit.duplicate_of_window_id,
                )

            await conn.execute(
                "UPDATE projects SET status = 'ready', updated_at = NOW() "
                "WHERE token = $1",
                project_token,
            )


async def mark_initial_generation_failed(
    database: Database,
    project_token: str,
) -> None:
    async with database.pool.acquire() as conn:
        await conn.execute(
            "UPDATE projects SET status = 'failed', updated_at = NOW() "
            "WHERE token = $1",
            project_token,
        )


async def restore_after_regeneration_failure(
    database: Database,
    project_token: str,
) -> None:
    async with database.pool.acquire() as conn:
        await conn.execute(
            "UPDATE projects SET status = 'ready', updated_at = NOW() "
            "WHERE token = $1",
            project_token,
        )
