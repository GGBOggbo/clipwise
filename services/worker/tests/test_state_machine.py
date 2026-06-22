import pytest
from clipwise_worker.tasks import TaskRepo


@pytest.mark.asyncio
async def test_update_progress_persists(db):
    repo = TaskRepo(db)
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO jobs (task_id, type, status, progress, message) "
            "VALUES ('sm-1', 'generate_candidates', 'running', 0, '已开始')"
        )
    await repo.update_progress("sm-1", 50, "正在识别语音")
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT progress, message FROM jobs WHERE task_id='sm-1'")
    assert row["progress"] == 50
    assert row["message"] == "正在识别语音"


@pytest.mark.asyncio
async def test_mark_succeeded_sets_100(db):
    repo = TaskRepo(db)
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO jobs (task_id, type, status, progress, message) "
            "VALUES ('sm-2', 'generate_candidates', 'running', 50, '处理中')"
        )
    await repo.mark_succeeded("sm-2", "完成")
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status, progress FROM jobs WHERE task_id='sm-2'")
    assert row["status"] == "succeeded"
    assert row["progress"] == 100


@pytest.mark.asyncio
async def test_mark_failed_records_error_code(db):
    repo = TaskRepo(db)
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO jobs (task_id, type, status, progress, message) "
            "VALUES ('sm-3', 'generate_candidates', 'running', 0, '处理中')"
        )
    await repo.mark_failed("sm-3", "asr_failed", "语音识别失败")
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, error_code, message FROM jobs WHERE task_id='sm-3'"
        )
    assert row["status"] == "failed"
    assert row["error_code"] == "asr_failed"
    assert row["message"] == "语音识别失败"
