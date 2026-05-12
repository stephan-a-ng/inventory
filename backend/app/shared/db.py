"""asyncpg connection pool"""
import json
import os
import asyncpg
from app.shared.config import DATABASE_URL


async def _register_codecs(conn):
    """Per-connection codecs. Without these, JSONB columns come back as raw
    JSON strings — a common source of `Object.keys(stringValue)` bugs on
    the frontend (the audit log's old_value/new_value, for instance).
    """
    await conn.set_type_codec(
        'jsonb',
        encoder=json.dumps,
        decoder=json.loads,
        schema='pg_catalog',
    )
    await conn.set_type_codec(
        'json',
        encoder=json.dumps,
        decoder=json.loads,
        schema='pg_catalog',
    )


class DatabasePool:
    _pool = None

    @classmethod
    async def initialize(cls, database_url: str = None):
        url = database_url or DATABASE_URL
        # Cloud SQL Unix socket support
        instance = os.getenv("INSTANCE_CONNECTION_NAME")
        if instance and "/cloudsql/" not in url:
            # Rewrite TCP URL to use Unix socket
            # postgresql://user:pass@host/db → postgresql://user:pass@/db?host=/cloudsql/INSTANCE
            import re
            m = re.match(r"(postgresql://[^@]+)@[^/]+(/.+)", url)
            if m:
                url = f"{m.group(1)}@{m.group(2)}?host=/cloudsql/{instance}"
        cls._pool = await asyncpg.create_pool(
            url, min_size=1, max_size=5,
            server_settings={'search_path': 'inventory'},
            init=_register_codecs,
        )

    @classmethod
    async def close(cls):
        if cls._pool:
            await cls._pool.close()

    @classmethod
    async def execute(cls, query: str, *args):
        async with cls._pool.acquire() as conn:
            return await conn.execute(query, *args)

    @classmethod
    async def fetchrow(cls, query: str, *args):
        async with cls._pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    @classmethod
    async def fetch(cls, query: str, *args):
        async with cls._pool.acquire() as conn:
            return await conn.fetch(query, *args)

    @classmethod
    async def fetchval(cls, query: str, *args):
        async with cls._pool.acquire() as conn:
            return await conn.fetchval(query, *args)
