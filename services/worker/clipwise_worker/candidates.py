from __future__ import annotations

import uuid

from .db import Database
from .highlight_models import FinalCandidate


async def replace_project_candidates(
    database: Database,
    project_token: str,
    candidates: list[FinalCandidate],
) -> None:
    async with database.pool.acquire() as conn:
        async with conn.transaction():
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
                        recommendation_reason, risk_notices, preview_status
                    ) VALUES (
                        $1, $2, $3, $4, $5,
                        $6, $7, $8,
                        $9, $10, $11, $12,
                        $13, $14, 'not_previewed'
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
