from __future__ import annotations

import asyncio
import logging
from typing import Any
from .db import Database
from .tasks import TaskRepo
from .mock_ai import generate_mock_candidates

logger = logging.getLogger(__name__)

# 任务类型 → 产品化阶段文案（design §14.2：禁止日志/模型名）
STAGE_MESSAGES = {
    "generate_candidates": [
        (10, "正在识别语音"),
        (40, "正在分析内容"),
        (70, "正在生成候选片段"),
    ],
    "regenerate_candidates": [
        (20, "正在重新分析内容"),
        (60, "正在生成候选片段"),
    ],
}


class Pipeline:
    def __init__(
        self,
        database: Database,
        repo: TaskRepo,
        poll_interval: float = 1.0,
        max_iterations: int | None = None,
    ) -> None:
        self._db = database
        self._repo = repo
        self._poll_interval = poll_interval
        self._max_iterations = max_iterations  # None = 无限循环；测试用 0 或正数

    async def recover_interrupted(self) -> None:
        async with self._db.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE jobs SET status = 'failed', error_code = 'interrupted', "
                "message = '处理进程中断，请重试', updated_at = NOW() "
                "WHERE status = 'running'"
            )
            if result != "UPDATE 0":
                logger.warning("恢复了中断的 running 任务: %s", result)

    async def process_task(self, task: dict[str, Any]) -> None:
        task_id = task["task_id"]
        project_token = task["project_token"]
        job_type = task["type"]

        try:
            messages = STAGE_MESSAGES.get(job_type, [(50, "处理中")])
            for progress, message in messages:
                await self._repo.update_progress(task_id, progress, message)
                await asyncio.sleep(0.05)  # 模拟处理耗时

            if job_type in ("generate_candidates", "regenerate_candidates"):
                await generate_mock_candidates(self._db, project_token)

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
