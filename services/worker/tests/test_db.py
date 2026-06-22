import pytest


@pytest.mark.asyncio
async def test_database_connects_and_queries(db):
    async with db.pool.acquire() as conn:
        result = await conn.fetchval("SELECT 1")
        assert result == 1


@pytest.mark.asyncio
async def test_jobs_table_exists(db):
    async with db.pool.acquire() as conn:
        count = await conn.fetchval("SELECT count(*) FROM jobs")
        assert count is not None
