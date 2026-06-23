import pytest
import uuid
from clipwise_worker.pipeline import Pipeline
from clipwise_worker.tasks import TaskRepo
from clipwise_worker.config import WorkerConfig
from clipwise_worker.highlight_models import (
    FinalCandidate,
    FinalSubtitle,
    HighlightPipelineResult,
    ScoreDimensions,
)


_DIMENSIONS = ScoreDimensions.model_validate(
    {
        "informationDensity": 4,
        "hookStrength": 3,
        "standaloneClarity": 4,
        "editability": 4,
    }
)


@pytest.fixture
def worker_config():
    return WorkerConfig(
        database_url="postgres://clipwise:clipwise_dev@localhost:5432/clipwise",
        groq_api_key="fake-test-key",
    )


@pytest.mark.asyncio
async def test_recover_interrupted_marks_running_as_failed(db, worker_config):
    task_id = f"interrupted-{uuid.uuid4()}"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO jobs (task_id, type, status, progress, message) "
            "VALUES ($1, 'generate_candidates', 'running', 30, '处理中')",
            task_id,
        )

    try:
        pipeline = Pipeline(db, TaskRepo(db), worker_config, max_iterations=0)
        await pipeline.recover_interrupted()

        async with db.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT status, error_code FROM jobs WHERE task_id = $1",
                task_id,
            )
        assert row["status"] == "failed"
        assert row["error_code"] == "interrupted"
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute("DELETE FROM jobs WHERE task_id = $1", task_id)


@pytest.mark.asyncio
async def test_process_task_calls_injected_candidate_service_and_succeeds(
    db,
    worker_config,
):
    class FakeCandidateService:
        def __init__(self):
            self.generate_calls = []

        async def generate(self, project_token, progress_callback=None):
            self.generate_calls.append(project_token)
            return HighlightPipelineResult(
                candidates=[
                    FinalCandidate(
                        rank=1,
                        recommendation="recommended",
                        final_score=88,
                        dimensions=_DIMENSIONS,
                        type="观点",
                        rejection_reason="none",
                        topic_label="测试主题",
                        start_ms=0,
                        end_ms=90_000,
                        title_options=["真实标题一", "真实标题二", "真实标题三"],
                        selected_title="真实标题一",
                        summary="真实摘要",
                        quote="真实原文",
                        recommendation_reason="观点完整",
                        editing_note="可直接粗剪。",
                        boundary_reason="覆盖完整观点。",
                        needs_setup=False,
                        risk_notices=[],
                        subtitles=[
                            FinalSubtitle(
                                start_ms=0,
                                end_ms=90_000,
                                text="真实原文",
                            )
                        ],
                    )
                ],
                window_scores=[],
            )

    service = FakeCandidateService()
    project_token = f"pipe-{uuid.uuid4()}"
    task_id = f"pipe-task-{uuid.uuid4()}"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            "VALUES ($1, 'transcribing', 'missing', NOW() + INTERVAL '7 days')",
            project_token,
        )
        await conn.execute(
            "INSERT INTO jobs (task_id, project_token, type, status, progress, message) "
            "VALUES ($1, $2, 'generate_candidates', 'running', 0, '等待')",
            task_id,
            project_token,
        )

    repo = TaskRepo(db)
    pipeline = Pipeline(
        db,
        repo,
        worker_config,
        max_iterations=0,
        candidate_service_factory=lambda _: service,
    )
    await pipeline.process_task(
        {
            "task_id": task_id,
            "project_token": project_token,
            "type": "generate_candidates",
        }
    )

    async with db.pool.acquire() as conn:
        job = await conn.fetchrow(
            "SELECT status, progress FROM jobs WHERE task_id = $1",
            task_id,
        )
        project = await conn.fetchrow(
            "SELECT status FROM projects WHERE token = $1",
            project_token,
        )
        candidate_count = await conn.fetchval(
            "SELECT count(*) FROM clip_candidates WHERE project_token = $1",
            project_token,
        )

    assert job["status"] == "succeeded"
    assert job["progress"] == 100
    assert project["status"] == "ready"
    assert candidate_count == 1
    assert service.generate_calls == [project_token]

    async with db.pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM projects WHERE token = $1",
            project_token,
        )
