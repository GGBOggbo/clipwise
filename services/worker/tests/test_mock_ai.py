import pytest
from clipwise_worker.mock_ai import generate_mock_candidates


@pytest.fixture(autouse=True)
async def cleanup_test_projects(db):
    """每个测试前后清理非 demo-project 的测试数据，避免主键残留。"""
    yield
    async with db.pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM projects WHERE token NOT IN ('demo-project')"
        )


@pytest.mark.asyncio
async def test_generate_mock_candidates_inserts_into_db(db):
    project_token = "mock-test-project"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            "VALUES ($1, 'analyzing', 'missing', NOW() + INTERVAL '7 days') "
            "ON CONFLICT DO NOTHING",
            project_token,
        )

    await generate_mock_candidates(db, project_token)

    async with db.pool.acquire() as conn:
        candidate = await conn.fetchrow(
            "SELECT * FROM clip_candidates WHERE project_token = $1 AND id = $2",
            project_token,
            f"{project_token}-candidate-1",
        )
        subtitle = await conn.fetchrow(
            "SELECT * FROM subtitle_lines WHERE candidate_id = $1",
            f"{project_token}-candidate-1",
        )

    assert candidate is not None
    assert candidate["rank"] == 1
    assert candidate["final_score"] == 92
    assert candidate["type"] == "观点"
    assert len(candidate["title_options"]) == 3
    assert subtitle is not None

    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM projects WHERE token = $1", project_token)


@pytest.mark.asyncio
async def test_generate_mock_candidates_replaces_existing(db):
    project_token = "mock-replace-project"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            "VALUES ($1, 'analyzing', 'missing', NOW() + INTERVAL '7 days') "
            "ON CONFLICT DO NOTHING",
            project_token,
        )
        await conn.execute(
            "INSERT INTO clip_candidates (id, project_token, rank, final_score, type, "
            "start_ms, end_ms, duration_ms, title_options, selected_title, summary, "
            "quote, recommendation_reason, risk_notices) "
            "VALUES ('old-1', $1, 1, 50, '观点', 0, 1000, 1000, ARRAY['旧'], '旧', "
            "'旧摘要', '旧金句', '旧理由', ARRAY[]::text[])",
            project_token,
        )

    await generate_mock_candidates(db, project_token)

    async with db.pool.acquire() as conn:
        old = await conn.fetchrow("SELECT * FROM clip_candidates WHERE id = 'old-1'")
        new = await conn.fetchrow(
            "SELECT * FROM clip_candidates WHERE project_token = $1 AND id = $2",
            project_token,
            f"{project_token}-candidate-1",
        )

    assert old is None
    assert new is not None

    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM projects WHERE token = $1", project_token)
