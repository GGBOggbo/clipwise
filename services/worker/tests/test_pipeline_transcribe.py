import pytest
import uuid
from unittest.mock import patch, AsyncMock
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
async def test_transcribe_job_writes_segments_and_creates_generate_job(db, worker_config):
    """transcribe_audio 完成后：transcript_segments 有数据 + 新 generate_candidates job 存在"""
    project_token = f"transcribe-test-{uuid.uuid4()}"
    project_file_id = f"pf-{uuid.uuid4()}"
    task_id = f"trans-task-{uuid.uuid4()}"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            "VALUES ($1, 'transcribing', 'missing', NOW() + INTERVAL '7 days')",
            project_token,
        )
        await conn.execute(
            "INSERT INTO project_files (id, project_token, kind, storage_path, size_bytes, chunk_index, start_offset_ms) "
            "VALUES ($1, $2, 'compressed_audio', '/fake/chunk.mp3', 100, 0, 0)",
            project_file_id,
            project_token,
        )
        await conn.execute(
            "INSERT INTO jobs (task_id, project_token, type, status, progress, message) "
            "VALUES ($1, $2, 'transcribe_audio', 'running', 0, '等待')",
            task_id,
            project_token,
        )

    repo = TaskRepo(db)
    pipeline = Pipeline(db, repo, worker_config, max_iterations=0)

    # mock Groq 返回 + 文件读取（不真调 API）
    fake_segments = [{"id": 0, "start": 0.0, "end": 5.0, "text": "测试文本", "words": []}]
    with patch("clipwise_worker.pipeline.GroqTranscriber") as mock_transcriber_cls, \
         patch(
             "clipwise_worker.pipeline.read_project_audio_files",
             new=AsyncMock(return_value=[("/fake/chunk.mp3", 0.0)]),
         ), \
         patch("clipwise_worker.pipeline.delete_audio_files", new=AsyncMock()):
        mock_transcriber_cls.return_value.transcribe_file.return_value = fake_segments
        await pipeline.process_task(
            {
                "task_id": task_id,
                "project_token": project_token,
                "type": "transcribe_audio",
            }
        )

    async with db.pool.acquire() as conn:
        seg_count = await conn.fetchval(
            "SELECT count(*) FROM transcript_segments WHERE project_token = $1",
            project_token,
        )
        gen_job = await conn.fetchrow(
            "SELECT status FROM jobs WHERE project_token = $1 AND type = 'generate_candidates'",
            project_token,
        )
        trans_job = await conn.fetchrow(
            "SELECT status FROM jobs WHERE task_id = $1",
            task_id,
        )

    assert seg_count == 1
    assert gen_job is not None
    assert gen_job["status"] == "pending"
    assert trans_job["status"] == "succeeded"

    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM projects WHERE token = $1", project_token)


@pytest.mark.asyncio
async def test_transcribe_job_fails_when_no_audio(db, worker_config):
    """没有音频文件时 transcribe_audio 失败 with error_code=no_audio"""
    project_token = f"transcribe-noaudio-{uuid.uuid4()}"
    task_id = f"trans-na-{uuid.uuid4()}"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            "VALUES ($1, 'transcribing', 'missing', NOW() + INTERVAL '7 days')",
            project_token,
        )
        await conn.execute(
            "INSERT INTO jobs (task_id, project_token, type, status, progress, message) "
            "VALUES ($1, $2, 'transcribe_audio', 'running', 0, '等待')",
            task_id,
            project_token,
        )

    repo = TaskRepo(db)
    pipeline = Pipeline(db, repo, worker_config, max_iterations=0)

    with patch(
        "clipwise_worker.pipeline.read_project_audio_files",
        new=AsyncMock(return_value=[]),
    ):
        await pipeline.process_task(
            {
                "task_id": task_id,
                "project_token": project_token,
                "type": "transcribe_audio",
            }
        )

    async with db.pool.acquire() as conn:
        job = await conn.fetchrow(
            "SELECT status, error_code FROM jobs WHERE task_id = $1",
            task_id,
        )

    assert job["status"] == "failed"
    assert job["error_code"] == "no_audio"

    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM projects WHERE token = $1", project_token)


@pytest.mark.asyncio
async def test_transcribe_job_fails_on_groq_error(db, worker_config):
    """Groq 调用失败时 transcribe_audio 失败 with error_code=asr_chunk_failed"""
    project_token = f"transcribe-groqfail-{uuid.uuid4()}"
    project_file_id = f"pf-g-{uuid.uuid4()}"
    task_id = f"trans-groqfail-{uuid.uuid4()}"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects (token, status, video_connection_status, expires_at) "
            "VALUES ($1, 'transcribing', 'missing', NOW() + INTERVAL '7 days')",
            project_token,
        )
        await conn.execute(
            "INSERT INTO project_files (id, project_token, kind, storage_path, size_bytes, chunk_index, start_offset_ms) "
            "VALUES ($1, $2, 'compressed_audio', '/fake/chunk.mp3', 100, 0, 0)",
            project_file_id,
            project_token,
        )
        await conn.execute(
            "INSERT INTO jobs (task_id, project_token, type, status, progress, message) "
            "VALUES ($1, $2, 'transcribe_audio', 'running', 0, '等待')",
            task_id,
            project_token,
        )

    repo = TaskRepo(db)
    pipeline = Pipeline(db, repo, worker_config, max_iterations=0)

    with patch("clipwise_worker.pipeline.GroqTranscriber") as mock_transcriber_cls, \
         patch(
             "clipwise_worker.pipeline.read_project_audio_files",
             new=AsyncMock(return_value=[("/fake/chunk.mp3", 0.0)]),
         ):
        mock_transcriber_cls.return_value.transcribe_file.side_effect = RuntimeError("groq 429")
        await pipeline.process_task(
            {
                "task_id": task_id,
                "project_token": project_token,
                "type": "transcribe_audio",
            }
        )

    async with db.pool.acquire() as conn:
        job = await conn.fetchrow(
            "SELECT status, error_code FROM jobs WHERE task_id = $1",
            task_id,
        )

    assert job["status"] == "failed"
    assert job["error_code"] == "asr_chunk_failed"

    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM projects WHERE token = $1", project_token)
