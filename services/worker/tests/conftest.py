import os
import asyncio
import pytest
import pytest_asyncio
from clipwise_worker.config import WorkerConfig
from clipwise_worker.db import Database


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db() -> Database:
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgres://clipwise:clipwise_dev@localhost:5432/clipwise",
    )
    config = WorkerConfig(database_url=database_url)
    database = Database(config)
    await database.connect()
    yield database
    await database.close()
