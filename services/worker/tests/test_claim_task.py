import pytest
from clipwise_worker.tasks import TaskRepo


@pytest.mark.asyncio
async def test_claim_returns_none_when_no_pending(db):
    repo = TaskRepo(db)
    async with db.pool.acquire() as conn:
        await conn.execute("TRUNCATE jobs CASCADE")
    task = await repo.claim_next()
    assert task is None


@pytest.mark.asyncio
async def test_claim_returns_oldest_pending_task(db):
    repo = TaskRepo(db)
    async with db.pool.acquire() as conn:
        await conn.execute("TRUNCATE jobs CASCADE")
        await conn.execute(
            "INSERT INTO jobs (task_id, type, status, progress, message) "
            "VALUES ('older', 'generate_candidates', 'pending', 0, '等待'), "
            "('newer', 'generate_candidates', 'pending', 0, '等待')"
        )
    task = await repo.claim_next()
    assert task is not None
    assert task["task_id"] == "older"
    assert task["status"] == "running"


@pytest.mark.asyncio
async def test_claim_is_idempotent_second_call_skips_running(db):
    repo = TaskRepo(db)
    async with db.pool.acquire() as conn:
        await conn.execute("TRUNCATE jobs CASCADE")
        await conn.execute(
            "INSERT INTO jobs (task_id, type, status, progress, message) "
            "VALUES ('t1', 'generate_candidates', 'pending', 0, '等待')"
        )
    first = await repo.claim_next()
    second = await repo.claim_next()
    assert first is not None
    assert second is None
