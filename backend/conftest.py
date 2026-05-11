"""Shared pytest fixtures for the inventory backend.

Two flavours of fixture:

- Unit tests get `mock_pool` — an AsyncMock that replaces `DatabasePool` at the
  module boundary. The pool's behavior is configured per-test.

- Integration tests get `pg_pool` (session) + `clean_db` (function) — a real
  asyncpg pool against the `inventory_test` Postgres on port 5451. The pool
  applies the project's `schema.sql` once; each test gets a clean DB.

The split keeps unit-test feedback under 100ms while letting integration tests
exercise the full request → DB → response path.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import AsyncIterator, Callable
from unittest.mock import AsyncMock
from uuid import uuid4

import asyncpg
import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

from app.features.auth import create_jwt_token
from app.shared import db as db_module


# ---------------------------------------------------------------------------
# Unit-test fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_pool(monkeypatch):
    """AsyncMock replacements for every DatabasePool classmethod.

    We patch the classmethods on the actual `DatabasePool` class so any module
    that did `from app.shared.db import DatabasePool` still sees the mocks —
    they share the same class object.

    Configure return values per-test:
        mock_pool.fetchrow.return_value = {"id": ..., "mac_address": ...}
        mock_pool.fetch.return_value = [row1, row2]
        mock_pool.fetchval.return_value = 0
        mock_pool.execute.return_value = "DELETE 1"
    """
    mock = AsyncMock()
    mock.fetchrow = AsyncMock(return_value=None)
    mock.fetch = AsyncMock(return_value=[])
    mock.fetchval = AsyncMock(return_value=None)
    mock.execute = AsyncMock(return_value="")
    monkeypatch.setattr(db_module.DatabasePool, "fetchrow", mock.fetchrow)
    monkeypatch.setattr(db_module.DatabasePool, "fetch", mock.fetch)
    monkeypatch.setattr(db_module.DatabasePool, "fetchval", mock.fetchval)
    monkeypatch.setattr(db_module.DatabasePool, "execute", mock.execute)
    return mock


# ---------------------------------------------------------------------------
# Integration-test fixtures
# ---------------------------------------------------------------------------


TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5451/inventory_test",
)

if "inventory_test" not in TEST_DB_URL:
    raise RuntimeError(
        "TEST_DATABASE_URL must reference an inventory_test database. "
        f"Got: {TEST_DB_URL!r}. Refusing to run integration tests against a non-test DB."
    )


@pytest_asyncio.fixture(scope="session")
async def pg_pool() -> AsyncIterator[asyncpg.Pool]:
    """Session-scoped test DB pool. Applies schema once at startup."""
    pool = await asyncpg.create_pool(
        TEST_DB_URL,
        min_size=1,
        max_size=5,
        server_settings={"search_path": "inventory"},
    )
    schema_path = Path(__file__).resolve().parent / "app" / "shared" / "schema.sql"
    async with pool.acquire() as conn:
        await conn.execute(schema_path.read_text())
    yield pool
    await pool.close()


@pytest_asyncio.fixture
async def clean_db(pg_pool: asyncpg.Pool):
    """Truncate every mutable table before each integration test."""
    async with pg_pool.acquire() as conn:
        await conn.execute(
            "TRUNCATE inventory.audit_log, inventory.board_revisions, "
            "inventory.devices, inventory.users RESTART IDENTITY CASCADE"
        )
    yield pg_pool


@pytest_asyncio.fixture
async def integration_pool(pg_pool: asyncpg.Pool, monkeypatch):
    """Swap the app's DatabasePool with the test pool for the duration of the test.

    This wires the FastAPI handlers to the `inventory_test` DB without needing
    every route to accept a pool parameter.
    """
    db_module.DatabasePool._pool = pg_pool
    yield pg_pool
    # session-scoped pool stays open for the rest of the suite


@pytest_asyncio.fixture
async def auth_user(clean_db: asyncpg.Pool) -> Callable:
    """Factory: create a user with the given role, return (user_dict, jwt_token).

    Usage:
        user, token = await auth_user("admin")
    """
    async def _make(role: str = "admin", email: str | None = None) -> tuple[dict, str]:
        email = email or f"test-{uuid4().hex[:8]}@moonfive.tech"
        async with clean_db.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO inventory.users (email, name, role)
                   VALUES ($1, $2, $3) RETURNING id, email, name, role""",
                email, "Test User", role,
            )
        user = dict(row)
        token = create_jwt_token(str(user["id"]), user["email"], role=user["role"])
        return user, token

    return _make


@pytest_asyncio.fixture
async def client(integration_pool, auth_user) -> AsyncIterator[httpx.AsyncClient]:
    """httpx AsyncClient against the FastAPI app.

    Default is unauthenticated. Use `auth_user` separately to mint a token and
    set it on the client via `client.cookies.set("auth_token", token)`.
    """
    # Importing here so the integration_pool fixture has already swapped the pool.
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
