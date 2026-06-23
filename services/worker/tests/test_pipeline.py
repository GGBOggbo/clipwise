import pytest
from clipwise_worker.pipeline import Pipeline
from clipwise_worker.tasks import TaskRepo
from clipwise_worker.config import WorkerConfig


@pytest.fixture
def worker_config():
    return WorkerConfig(
        database_url="postgres://clipwise:clipwise_dev@localhost:5432/clipwise",
        groq_api_key="fake-test-key",
    )


@pytest.mark.asyncio
async def test_recover_interrupted_marks_running_as_failed(db, worker_config):
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO jobs (task_id, type, status, progress, message) "
            "VALUES ('interrupted-1', 'generate_candidates', 'running', 30, '处理中')"
        )

    pipeline = Pipeline(db, TaskRepo(db), worker_config, max_iterations=0)
    await pipeline.recover_interrupted()

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, error_code FROM jobs WHERE task_id = 'interrupted-1'"
        )
    assert row["status"] == "failed"
    assert row["error_code"] == "interrupted"


@pytest.mark.asyncio
async def test_process_task_calls_mock_ai_and_succeeds(db, worker_config):
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            "VALUES ('pipe-test', 'transcribing', 'missing', NOW() + INTERVAL '7 days') "
            "ON CONFLICT DO NOTHING"
        )
        await conn.execute(
            "INSERT INTO jobs (task_id, project_token, type, status, progress, message) "
            "VALUES ('pipe-task', 'pipe-test', 'generate_candidates', 'pending', 0, '等待')"
        )

    repo = TaskRepo(db)
    pipeline = Pipeline(db, repo, worker_config, max_iterations=0)
    task = await repo.claim_next()
    await pipeline.process_task(task)

    async with db.pool.acquire() as conn:
        job = await conn.fetchrow("SELECT status, progress FROM jobs WHERE task_id='pipe-task'")
        project = await conn.fetchrow("SELECT status FROM projects WHERE token='pipe-test'")
        candidate_count = await conn.fetchval(
            "SELECT count(*) FROM clip_candidates WHERE project_token='pipe-test'"
        )

    assert job["status"] == "succeeded"
    assert job["progress"] == 100
    assert project["status"] == "ready"
    assert candidate_count == 7

    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM projects WHERE token = 'pipe-test'")
