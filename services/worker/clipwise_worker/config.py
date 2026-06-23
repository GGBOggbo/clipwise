from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class WorkerConfig:
    database_url: str
    groq_api_key: str
    groq_asr_model: str = "whisper-large-v3"
    deepseek_api_key: str = ""
    deepseek_api_base: str = "https://api.deepseek.com/beta"
    deepseek_model: str = "deepseek-v4-flash"
    deepseek_output_mode: str = "strict_tool"
    storage_root: str = "./storage"
    poll_interval_seconds: float = 1.0

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL 环境变量未设置")
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            raise RuntimeError("GROQ_API_KEY 环境变量未设置")
        poll_interval = float(os.environ.get("WORKER_POLL_INTERVAL", "1.0"))
        return cls(
            database_url=database_url,
            groq_api_key=groq_api_key,
            groq_asr_model=os.environ.get("GROQ_ASR_MODEL", "whisper-large-v3"),
            deepseek_api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            deepseek_api_base=os.environ.get(
                "DEEPSEEK_API_BASE",
                "https://api.deepseek.com/beta",
            ),
            deepseek_model=os.environ.get(
                "DEEPSEEK_MODEL",
                "deepseek-v4-flash",
            ),
            deepseek_output_mode=os.environ.get(
                "DEEPSEEK_OUTPUT_MODE",
                "strict_tool",
            ),
            storage_root=os.environ.get("STORAGE_ROOT", "./storage"),
            poll_interval_seconds=poll_interval,
        )
