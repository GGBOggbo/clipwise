from __future__ import annotations

import asyncio
import logging
from .config import WorkerConfig
from .db import Database
from .tasks import TaskRepo
from .pipeline import Pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


async def main() -> None:
    config = WorkerConfig.from_env()
    database = Database(config)
    await database.connect()
    repo = TaskRepo(database)
    pipeline = Pipeline(database, repo, config, poll_interval=config.poll_interval_seconds)
    try:
        await pipeline.run()
    finally:
        await database.close()


if __name__ == "__main__":
    asyncio.run(main())
