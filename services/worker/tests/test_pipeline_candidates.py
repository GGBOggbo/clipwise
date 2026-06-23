import uuid

import pytest

from clipwise_worker.config import WorkerConfig
from clipwise_worker.highlight_pipeline import HighlightGenerationError
from clipwise_worker.pipeline import Pipeline
from clipwise_worker.tasks import TaskRepo


@pytest.fixture
def worker_config():
    return WorkerConfig(
        database_url="postgres://clipwise:clipwise_dev@localhost:5432/clipwise",
        groq_api_key="fake-test-key",
        deepseek_api_key="fake-deepseek-key",
    )


class FailingCandidateService:
    async def generate(self, project_token, progress_callback=None):
        raise HighlightGenerationError(
            "deepseek_invalid_response",
            "模型返回不符合协议",
        )


async def create_project_and_job(db, job_type):
    token = f"pipeline-{uuid.uuid4()}"
    task_id = f"task-{uuid.uuid4()}"
    status = "ready" if job_type == "regenerate_candidates" else "analyzing"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects "
            "(token, status, video_connection_status, expires_at) "
            "VALUES ($1, $2, 'missing', NOW() + INTERVAL '7 days')",
            token,
            status,
        )
        await conn.execute(
            "INSERT INTO jobs "
            "(task_id, project_token, type, status, progress, message) "
            "VALUES ($1, $2, $3, 'running', 0, '等待')",
            task_id,
            token,
            job_type,
        )
    return token, task_id


async def insert_old_candidate(db, token):
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO clip_candidates ("
            "id, project_token, rank, final_score, type, start_ms, end_ms, "
            "duration_ms, title_options, selected_title, summary, quote, "
            "recommendation_reason, risk_notices, preview_status"
            ") VALUES ("
            "$1, $2, 1, 70, '观点', 0, 90000, 90000, "
            "ARRAY['旧标题一','旧标题二','旧标题三'], '旧标题一', "
            "'旧摘要', '旧原文', '旧理由', ARRAY[]::text[], 'not_previewed'"
            ")",
            f"{token}-old",
            token,
        )


@pytest.mark.asyncio
async def test_initial_generation_failure_marks_project_failed_without_candidates(
    db,
    worker_config,
):
    token, task_id = await create_project_and_job(db, "generate_candidates")
    repo = TaskRepo(db)
    pipeline = Pipeline(
        db,
        repo,
        worker_config,
        max_iterations=0,
        candidate_service_factory=lambda _: FailingCandidateService(),
    )

    try:
        await pipeline.process_task(
            {
                "task_id": task_id,
                "project_token": token,
                "type": "generate_candidates",
            }
        )

        async with db.pool.acquire() as conn:
            job = await conn.fetchrow(
                "SELECT status, error_code FROM jobs WHERE task_id = $1",
                task_id,
            )
            project_status = await conn.fetchval(
                "SELECT status FROM projects WHERE token = $1",
                token,
            )
            candidate_count = await conn.fetchval(
                "SELECT count(*) FROM clip_candidates WHERE project_token = $1",
                token,
            )

        assert job["status"] == "failed"
        assert job["error_code"] == "deepseek_invalid_response"
        assert project_status == "failed"
        assert candidate_count == 0
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute("DELETE FROM projects WHERE token = $1", token)


@pytest.mark.asyncio
async def test_regeneration_failure_preserves_candidates_and_restores_ready(
    db,
    worker_config,
):
    token, task_id = await create_project_and_job(db, "regenerate_candidates")
    await insert_old_candidate(db, token)
    repo = TaskRepo(db)
    pipeline = Pipeline(
        db,
        repo,
        worker_config,
        max_iterations=0,
        candidate_service_factory=lambda _: FailingCandidateService(),
    )

    try:
        await pipeline.process_task(
            {
                "task_id": task_id,
                "project_token": token,
                "type": "regenerate_candidates",
            }
        )

        async with db.pool.acquire() as conn:
            job = await conn.fetchrow(
                "SELECT status, error_code FROM jobs WHERE task_id = $1",
                task_id,
            )
            project_status = await conn.fetchval(
                "SELECT status FROM projects WHERE token = $1",
                token,
            )
            candidates = await conn.fetch(
                "SELECT selected_title FROM clip_candidates "
                "WHERE project_token = $1",
                token,
            )

        assert job["status"] == "failed"
        assert job["error_code"] == "deepseek_invalid_response"
        assert project_status == "ready"
        assert [row["selected_title"] for row in candidates] == ["旧标题一"]
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute("DELETE FROM projects WHERE token = $1", token)
