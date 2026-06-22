from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class WorkerConfig:
    database_url: str
    poll_interval_seconds: float = 1.0

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL 环境变量未设置")
        poll_interval = float(os.environ.get("WORKER_POLL_INTERVAL", "1.0"))
        return cls(database_url=database_url, poll_interval_seconds=poll_interval)
