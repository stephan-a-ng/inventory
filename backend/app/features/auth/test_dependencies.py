"""Unit tests for auth dependencies — JWT-cookie auth and role gating."""
from uuid import uuid4
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.features.auth import create_jwt_token
from app.features.auth.dependencies import get_current_user, require_role


def _request_with_token(token: str | None) -> MagicMock:
    req = MagicMock()
    req.cookies = {"auth_token": token} if token else {}
    return req


async def test_get_current_user_no_cookie_raises_401(mock_pool):
    req = _request_with_token(None)
    with pytest.raises(HTTPException) as exc:
        await get_current_user(req)
    assert exc.value.status_code == 401


async def test_get_current_user_invalid_token_raises_401(mock_pool):
    req = _request_with_token("garbage")
    with pytest.raises(HTTPException) as exc:
        await get_current_user(req)
    assert exc.value.status_code == 401


async def test_get_current_user_returns_user_when_valid(mock_pool):
    user_id = str(uuid4())
    token = create_jwt_token(user_id, "alice@moonfive.tech", role="admin")
    mock_pool.fetchrow.return_value = {
        "id": user_id, "email": "alice@moonfive.tech",
        "name": "Alice", "picture": None, "role": "admin",
    }

    req = _request_with_token(token)
    user = await get_current_user(req)
    assert user["email"] == "alice@moonfive.tech"
    assert user["role"] == "admin"


async def test_require_role_admits_matching_role(mock_pool):
    user_id = str(uuid4())
    token = create_jwt_token(user_id, "alice@moonfive.tech", role="admin")
    mock_pool.fetchrow.return_value = {
        "id": user_id, "email": "alice@moonfive.tech",
        "name": "Alice", "picture": None, "role": "admin",
    }

    dep = require_role("admin")
    req = _request_with_token(token)
    user = await dep(req)
    assert user["role"] == "admin"


async def test_require_role_rejects_wrong_role(mock_pool):
    user_id = str(uuid4())
    token = create_jwt_token(user_id, "bob@moonfive.tech", role="viewer")
    mock_pool.fetchrow.return_value = {
        "id": user_id, "email": "bob@moonfive.tech",
        "name": "Bob", "picture": None, "role": "viewer",
    }

    dep = require_role("admin", "technician")
    req = _request_with_token(token)
    with pytest.raises(HTTPException) as exc:
        await dep(req)
    assert exc.value.status_code == 403


async def test_require_role_accepts_any_of_listed(mock_pool):
    user_id = str(uuid4())
    token = create_jwt_token(user_id, "tech@moonfive.tech", role="technician")
    mock_pool.fetchrow.return_value = {
        "id": user_id, "email": "tech@moonfive.tech",
        "name": "Tech", "picture": None, "role": "technician",
    }

    dep = require_role("admin", "technician")
    req = _request_with_token(token)
    user = await dep(req)
    assert user["role"] == "technician"
