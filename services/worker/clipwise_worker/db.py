from __future__ import annotations

import asyncpg
from .config import WorkerConfig


class Database:
    def __init__(self, config: WorkerConfig) -> None:
        self._config = config
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            dsn=self._config.database_url,
            min_size=1,
            max_size=2,
        )

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Database not connected; call connect() first")
        return self._pool
