"""Unit tests for auth dependencies — JWT-cookie auth and role gating."""
from uuid import uuid4
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.features.auth import create_jwt_token
from app.features.auth.dependencies import get_current_user, require_role


def _request_with_token(token: str | None, *, bearer: bool = False) -> MagicMock:
    req = MagicMock()
    if bearer and token:
        req.cookies = {}
        req.headers = {"authorization": f"Bearer {token}"}
    else:
        req.cookies = {"auth_token": token} if token else {}
        req.headers = {}
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


async def test_get_current_user_via_bearer_header(mock_pool):
    user_id = str(uuid4())
    token = create_jwt_token(user_id, "installer@partner.com", role="installer")
    mock_pool.fetchrow.return_value = {
        "id": user_id, "email": "installer@partner.com",
        "name": "Inst", "picture": None, "role": "installer",
    }

    req = _request_with_token(token, bearer=True)
    user = await get_current_user(req)
    assert user["role"] == "installer"


async def test_bearer_header_takes_precedence_over_cookie(mock_pool):
    """When both are present, Authorization header wins."""
    bearer_user = str(uuid4())
    cookie_user = str(uuid4())
    bearer_token = create_jwt_token(bearer_user, "bearer@x.com", role="installer")
    cookie_token = create_jwt_token(cookie_user, "cookie@x.com", role="admin")

    mock_pool.fetchrow.return_value = {
        "id": bearer_user, "email": "bearer@x.com",
        "name": "B", "picture": None, "role": "installer",
    }

    req = MagicMock()
    req.cookies = {"auth_token": cookie_token}
    req.headers = {"authorization": f"Bearer {bearer_token}"}
    user = await get_current_user(req)
    assert user["email"] == "bearer@x.com"
    # Confirm DB was queried with the bearer's sub, not the cookie's sub.
    mock_pool.fetchrow.assert_awaited_once()
    assert mock_pool.fetchrow.await_args.args[1] == bearer_user


async def test_empty_bearer_falls_back_to_cookie(mock_pool):
    user_id = str(uuid4())
    token = create_jwt_token(user_id, "alice@moonfive.tech", role="admin")
    mock_pool.fetchrow.return_value = {
        "id": user_id, "email": "alice@moonfive.tech",
        "name": "A", "picture": None, "role": "admin",
    }

    req = MagicMock()
    req.cookies = {"auth_token": token}
    req.headers = {"authorization": "Bearer "}  # empty token in header
    user = await get_current_user(req)
    assert user["role"] == "admin"
