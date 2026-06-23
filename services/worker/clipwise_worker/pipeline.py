from __future__ import annotations

import asyncio
import logging
import os
import uuid
from collections.abc import Callable
from typing import Any
from .db import Database
from .tasks import TaskRepo
from .asr import GroqTranscriber, merge_segments_with_offset, save_transcript
from .config import WorkerConfig
from .candidates import (
    mark_initial_generation_failed,
    replace_project_candidates,
    restore_after_regeneration_failure,
)
from .deepseek import DeepSeekClient
from .highlight_pipeline import HighlightGenerationError, HighlightPipeline

logger = logging.getLogger(__name__)

# 任务类型 → 产品化阶段文案（design §14.2：禁止日志/模型名）
# transcribe_audio 的进度由 _process_transcribe 动态推（按分块完成数）
STAGE_MESSAGES = {
    "generate_candidates": [
        (20, "正在分析内容"),
        (60, "正在生成候选片段"),
    ],
    "regenerate_candidates": [
        (20, "正在重新分析内容"),
        (60, "正在生成候选片段"),
    ],
}

# 分块 overlap 秒数（与浏览器 ffmpeg.ts 的 OVERLAP_MS 对齐）
OVERLAP_SECONDS = 30.0


async def read_project_audio_files(
    database: Database, project_token: str
) -> list[tuple[str, float]]:
    """读取项目的音频块文件路径 + start_offset_seconds。

    Returns:
        [(storage_path, start_offset_seconds), ...] 按 chunk_index 排序
    """
    async with database.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT storage_path, start_offset_ms FROM project_files "
            "WHERE project_token = $1 AND kind = 'compressed_audio' "
            "ORDER BY chunk_index ASC",
            project_token,
        )
    return [(r["storage_path"], r["start_offset_ms"] / 1000.0) for r in rows]


async def delete_audio_files(database: Database, project_token: str) -> None:
    """删除音频文件 + project_files 记录（design §15 隐私：ASR 成功后删）。"""
    async with database.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT storage_path FROM project_files "
            "WHERE project_token = $1 AND kind = 'compressed_audio'",
            project_token,
        )
    for row in rows:
        try:
            os.remove(row["storage_path"])
        except FileNotFoundError:
            pass
    async with database.pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM project_files WHERE project_token = $1 AND kind = 'compressed_audio'",
            project_token,
        )


class Pipeline:
    def __init__(
        self,
        database: Database,
        repo: TaskRepo,
        config: WorkerConfig,
        poll_interval: float = 1.0,
        max_iterations: int | None = None,
        candidate_service_factory: Callable[[WorkerConfig], Any] | None = None,
    ) -> None:
        self._db = database
        self._repo = repo
        self._config = config
        self._poll_interval = poll_interval
        self._max_iterations = max_iterations  # None = 无限循环；测试用 0 或正数
        self._candidate_service_factory = (
            candidate_service_factory or self._build_candidate_service
        )

    def _build_candidate_service(self, config: WorkerConfig) -> HighlightPipeline:
        if not config.deepseek_api_key:
            raise HighlightGenerationError(
                "missing_deepseek_key",
                "DeepSeek API Key 未配置",
            )
        if config.deepseek_output_mode != "strict_tool":
            raise HighlightGenerationError(
                "deepseek_invalid_response",
                "当前只支持 DeepSeek strict tool 输出模式",
            )
        client = DeepSeekClient(
            api_key=config.deepseek_api_key,
            base_url=config.deepseek_api_base,
            model=config.deepseek_model,
        )
        return HighlightPipeline(self._db, client)

    async def recover_interrupted(self) -> None:
        async with self._db.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE jobs SET status = 'failed', error_code = 'interrupted', "
                "message = '处理进程中断，请重试', updated_at = NOW() "
                "WHERE status = 'running'"
            )
            if result != "UPDATE 0":
                logger.warning("恢复了中断的 running 任务: %s", result)

    async def _process_transcribe(self, task: dict[str, Any]) -> None:
        """transcribe_audio 任务：调 Groq ASR + 写 transcript + 建下一个 job。"""
        task_id = task["task_id"]
        project_token = task["project_token"]

        # 1. 读音频块
        audio_chunks = await read_project_audio_files(self._db, project_token)
        if not audio_chunks:
            await self._repo.mark_failed(task_id, "no_audio", "未找到音频文件")
            return

        await self._repo.update_progress(task_id, 5, "正在识别语音")

        # 2. 逐块调 Groq（串行，避免触发 RPM 限制）
        transcriber = GroqTranscriber(
            api_key=self._config.groq_api_key,
            model=self._config.groq_asr_model,
        )
        chunk_results: list[tuple[list, float]] = []
        total = len(audio_chunks)
        for i, (path, offset) in enumerate(audio_chunks):
            try:
                segments = transcriber.transcribe_file(path)
                chunk_results.append((segments, offset))
                progress = 10 + int((i + 1) / total * 70)
                await self._repo.update_progress(task_id, progress, "正在识别语音")
            except Exception as exc:
                logger.exception("ASR 分块 %d 失败", i)
                await self._repo.mark_failed(
                    task_id, "asr_chunk_failed", "语音识别失败，请重试"
                )
                return

        # 3. 合并 + 写 transcript
        await self._repo.update_progress(task_id, 85, "正在整理文本")
        merged = merge_segments_with_offset(chunk_results, overlap_seconds=OVERLAP_SECONDS)
        await save_transcript(self._db, project_token, merged)

        # 4. 删音频文件（§15 隐私）
        await delete_audio_files(self._db, project_token)

        # 5. 创建 generate_candidates job
        gen_task_id = str(uuid.uuid4())
        async with self._db.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO jobs (task_id, project_token, type, status, progress, message) "
                "VALUES ($1, $2, 'generate_candidates', 'pending', 0, '等待开始')",
                gen_task_id,
                project_token,
            )
            await conn.execute(
                "UPDATE projects SET status = 'analyzing', updated_at = NOW() WHERE token = $1",
                project_token,
            )

        await self._repo.mark_succeeded(task_id, "转写完成")

    async def _process_candidates(self, task: dict[str, Any]) -> None:
        task_id = task["task_id"]
        project_token = task["project_token"]
        job_type = task["type"]

        async def report(progress: int, message: str) -> None:
            await self._repo.update_progress(task_id, progress, message)

        try:
            service = self._candidate_service_factory(self._config)
            candidates = await service.generate(
                project_token,
                progress_callback=report,
            )
            try:
                await replace_project_candidates(
                    self._db,
                    project_token,
                    candidates,
                )
            except Exception:
                logger.exception("候选持久化失败: %s", task_id)
                if job_type == "regenerate_candidates":
                    await restore_after_regeneration_failure(
                        self._db,
                        project_token,
                    )
                else:
                    await mark_initial_generation_failed(
                        self._db,
                        project_token,
                    )
                await self._repo.mark_failed(
                    task_id,
                    "candidate_persist_failed",
                    "候选保存失败，请重试",
                )
                return

            await self._repo.mark_succeeded(task_id, "候选生成完成")
            logger.info("任务 %s 完成", task_id)
        except HighlightGenerationError as exc:
            if job_type == "regenerate_candidates":
                await restore_after_regeneration_failure(
                    self._db,
                    project_token,
                )
            else:
                await mark_initial_generation_failed(
                    self._db,
                    project_token,
                )
            await self._repo.mark_failed(
                task_id,
                exc.code,
                exc.user_message,
            )

    async def process_task(self, task: dict[str, Any]) -> None:
        task_id = task["task_id"]
        project_token = task["project_token"]
        job_type = task["type"]

        try:
            # transcribe_audio 走专门分支（动态进度，不用 STAGE_MESSAGES）
            if job_type == "transcribe_audio":
                await self._process_transcribe(task)
                return

            if job_type in ("generate_candidates", "regenerate_candidates"):
                await self._process_candidates(task)
                return

            messages = STAGE_MESSAGES.get(job_type, [(50, "处理中")])
            for progress, message in messages:
                await self._repo.update_progress(task_id, progress, message)
                await asyncio.sleep(0.05)  # 模拟处理耗时

            await self._repo.mark_succeeded(task_id, "候选生成完成")
            logger.info("任务 %s 完成", task_id)
        except Exception as exc:
            logger.exception("任务 %s 失败", task_id)
            await self._repo.mark_failed(task_id, "processing_failed", str(exc))

    async def run(self) -> None:
        await self.recover_interrupted()
        iterations = 0
        while self._max_iterations is None or iterations < self._max_iterations:
            task = await self._repo.claim_next()
            if task is None:
                await asyncio.sleep(self._poll_interval)
                iterations += 1
                continue
            await self.process_task(task)
            iterations += 1
