from __future__ import annotations

from typing import Any
from .db import Database

CLAIM_SQL = """
    UPDATE jobs
    SET status = 'running',
        progress = 0,
        message = '已开始处理',
        updated_at = NOW()
    WHERE task_id = (
        SELECT task_id FROM jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING task_id, project_token, type, status, progress, message
"""


class TaskRepo:
    def __init__(self, database: Database) -> None:
        self._db = database

    async def claim_next(self) -> dict[str, Any] | None:
        async with self._db.pool.acquire() as conn:
            row = await conn.fetchrow(CLAIM_SQL)
            return dict(row) if row else None

    async def update_progress(
        self,
        task_id: str,
        progress: int,
        message: str,
    ) -> None:
        async with self._db.pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET progress = $1, message = $2, updated_at = NOW() "
                "WHERE task_id = $3",
                progress,
                message,
                task_id,
            )

    async def mark_succeeded(self, task_id: str, message: str = "完成") -> None:
        async with self._db.pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET status = 'succeeded', progress = 100, "
                "message = $1, updated_at = NOW() WHERE task_id = $2",
                message,
                task_id,
            )

    async def mark_failed(
        self,
        task_id: str,
        error_code: str,
        message: str,
    ) -> None:
        async with self._db.pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET status = 'failed', error_code = $1, "
                "message = $2, updated_at = NOW() WHERE task_id = $3",
                error_code,
                message,
                task_id,
            )
