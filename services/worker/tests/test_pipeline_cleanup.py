import uuid

import pytest

from clipwise_worker.pipeline import Pipeline, purge_expired_projects
from clipwise_worker.tasks import TaskRepo
from clipwise_worker.config import WorkerConfig


@pytest.fixture
def worker_config():
    return WorkerConfig(
        database_url="postgres://clipwise:clipwise_dev@localhost:5432/clipwise",
        groq_api_key="fake-test-key",
    )


async def _insert_project(
    db,
    token: str,
    *,
    expired: bool,
    with_audio_file: bool = False,
):
    expires_at = "NOW() - INTERVAL '1 hour'" if expired else "NOW() + INTERVAL '7 days'"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            f"VALUES ($1, 'ready', 'missing', {expires_at})",
            token,
        )
        if with_audio_file:
            await conn.execute(
                "INSERT INTO project_files "
                "(id, project_token, kind, storage_path, size_bytes, chunk_index, start_offset_ms) "
                "VALUES ($2, $1, 'compressed_audio', '/nonexistent/cleanup-test.mp3', 100, 0, 0)",
                token,
                f"{token}-file",
            )


@pytest.mark.asyncio
async def test_purge_deletes_expired_projects_and_keeps_active(db):
    expired_token = f"cleanup-expired-{uuid.uuid4()}"
    active_token = f"cleanup-active-{uuid.uuid4()}"
    await _insert_project(db, expired_token, expired=True, with_audio_file=True)
    await _insert_project(db, active_token, expired=False, with_audio_file=True)

    try:
        deleted = await purge_expired_projects(db)

        assert deleted == 1
        async with db.pool.acquire() as conn:
            expired_exists = await conn.fetchval(
                "SELECT count(*) FROM projects WHERE token = $1",
                expired_token,
            )
            active_exists = await conn.fetchval(
                "SELECT count(*) FROM projects WHERE token = $1",
                active_token,
            )
            # 过期项目的关联文件也应 cascade 删除
            expired_files = await conn.fetchval(
                "SELECT count(*) FROM project_files WHERE project_token = $1",
                expired_token,
            )
        assert expired_exists == 0
        assert active_exists == 1
        assert expired_files == 0
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = ANY($1::text[])",
                [expired_token, active_token],
            )


@pytest.mark.asyncio
async def test_purge_no_expired_projects_returns_zero(db):
    deleted = await purge_expired_projects(db)
    assert deleted == 0


@pytest.mark.asyncio
async def test_maybe_purge_runs_on_first_call_then_respects_interval(
    db, worker_config
):
    """启动时立即清一次，之后受 cleanup_interval 控制。"""
    token = f"cleanup-interval-{uuid.uuid4()}"
    await _insert_project(db, token, expired=True)

    try:
        pipeline = Pipeline(
            db,
            TaskRepo(db),
            worker_config,
            max_iterations=0,
            # 设一个很大的间隔，验证首次调用仍会清理
            cleanup_interval_seconds=9999,
        )

        await pipeline._maybe_purge_expired()

        async with db.pool.acquire() as conn:
            exists = await conn.fetchval(
                "SELECT count(*) FROM projects WHERE token = $1",
                token,
            )
        assert exists == 0  # 首次调用立即清理

        # 再插一个过期的，此时间隔内不应再清理
        token2 = f"cleanup-interval2-{uuid.uuid4()}"
        await _insert_project(db, token2, expired=True)
        await pipeline._maybe_purge_expired()

        async with db.pool.acquire() as conn:
            exists2 = await conn.fetchval(
                "SELECT count(*) FROM projects WHERE token = $1",
                token2,
            )
        assert exists2 == 1  # 间隔内不清理
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE expires_at < NOW()",
            )
