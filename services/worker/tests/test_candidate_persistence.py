import uuid

import pytest

from clipwise_worker.candidates import (
    mark_initial_generation_failed,
    replace_project_candidates,
    restore_after_regeneration_failure,
)
from clipwise_worker.highlight_models import FinalCandidate, FinalSubtitle


def final_candidate(rank: int, *, title: str) -> FinalCandidate:
    start_ms = (rank - 1) * 100_000
    return FinalCandidate(
        rank=rank,
        final_score=90 - rank,
        type="观点",
        start_ms=start_ms,
        end_ms=start_ms + 90_000,
        title_options=[title, f"{title}二", f"{title}三"],
        selected_title=title,
        summary=f"{title}摘要",
        quote=f"{title}原文",
        recommendation_reason="观点完整",
        risk_notices=[],
        subtitles=[
            FinalSubtitle(
                start_ms=start_ms,
                end_ms=start_ms + 45_000,
                text=f"{title}原文",
            ),
            FinalSubtitle(
                start_ms=start_ms + 45_000,
                end_ms=start_ms + 90_000,
                text=f"{title}结论",
            ),
        ],
    )


async def insert_project(db, status="analyzing"):
    token = f"persist-{uuid.uuid4()}"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects "
            "(token, status, video_connection_status, expires_at) "
            "VALUES ($1, $2, 'missing', NOW() + INTERVAL '7 days')",
            token,
            status,
        )
    return token


async def insert_old_candidate(db, project_token):
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO clip_candidates ("
            "id, project_token, rank, final_score, type, start_ms, end_ms, "
            "duration_ms, title_options, selected_title, summary, quote, "
            "recommendation_reason, risk_notices, preview_status"
            ") VALUES ("
            "'old-candidate', $1, 1, 70, '观点', 0, 90000, 90000, "
            "ARRAY['旧标题一','旧标题二','旧标题三'], '旧标题一', "
            "'旧摘要', '旧原文', '旧理由', ARRAY[]::text[], 'not_previewed'"
            ")",
            project_token,
        )


@pytest.mark.asyncio
async def test_replace_project_candidates_writes_candidates_and_real_subtitles(db):
    token = await insert_project(db)

    try:
        await replace_project_candidates(
            db,
            token,
            [
                final_candidate(1, title="第一条"),
                final_candidate(2, title="第二条"),
            ],
        )

        async with db.pool.acquire() as conn:
            candidates = await conn.fetch(
                "SELECT id, rank, selected_title FROM clip_candidates "
                "WHERE project_token = $1 ORDER BY rank",
                token,
            )
            subtitles = await conn.fetch(
                "SELECT s.index, s.start_ms, s.end_ms, s.text "
                "FROM subtitle_lines s "
                "JOIN clip_candidates c ON c.id = s.candidate_id "
                "WHERE c.project_token = $1 ORDER BY c.rank, s.index",
                token,
            )
            status = await conn.fetchval(
                "SELECT status FROM projects WHERE token = $1",
                token,
            )

        assert [row["rank"] for row in candidates] == [1, 2]
        assert [row["selected_title"] for row in candidates] == [
            "第一条",
            "第二条",
        ]
        assert subtitles[0]["text"] == "第一条原文"
        assert subtitles[0]["start_ms"] == 0
        assert subtitles[1]["end_ms"] == 90_000
        assert status == "ready"
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute("DELETE FROM projects WHERE token = $1", token)


@pytest.mark.asyncio
async def test_replace_project_candidates_rolls_back_when_new_insert_fails(
    db,
    monkeypatch,
):
    token = await insert_project(db, status="ready")
    await insert_old_candidate(db, token)
    duplicate_uuid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    monkeypatch.setattr(
        "clipwise_worker.candidates.uuid.uuid4",
        lambda: duplicate_uuid,
    )

    try:
        with pytest.raises(Exception):
            await replace_project_candidates(
                db,
                token,
                [
                    final_candidate(1, title="新一"),
                    final_candidate(2, title="新二"),
                ],
            )

        async with db.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, selected_title FROM clip_candidates "
                "WHERE project_token = $1",
                token,
            )
            status = await conn.fetchval(
                "SELECT status FROM projects WHERE token = $1",
                token,
            )

        assert [(row["id"], row["selected_title"]) for row in rows] == [
            ("old-candidate", "旧标题一")
        ]
        assert status == "ready"
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute("DELETE FROM projects WHERE token = $1", token)


@pytest.mark.asyncio
async def test_generation_failure_helpers_set_expected_project_status(db):
    token = await insert_project(db)

    try:
        await mark_initial_generation_failed(db, token)
        async with db.pool.acquire() as conn:
            assert (
                await conn.fetchval(
                    "SELECT status FROM projects WHERE token = $1",
                    token,
                )
                == "failed"
            )

        await restore_after_regeneration_failure(db, token)
        async with db.pool.acquire() as conn:
            assert (
                await conn.fetchval(
                    "SELECT status FROM projects WHERE token = $1",
                    token,
                )
                == "ready"
            )
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute("DELETE FROM projects WHERE token = $1", token)
