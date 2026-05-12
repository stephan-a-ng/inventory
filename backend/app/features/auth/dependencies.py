"""Authentication dependencies — used by every feature's routes."""
from typing import Optional
from fastapi import Request, HTTPException

from app.shared.db import DatabasePool

from .jwt import verify_jwt_token


def _extract_token(request: Request) -> str:
    """Authorization: Bearer <jwt> first (mobile), then auth_token cookie (web)."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return token
    token = request.cookies.get("auth_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


async def get_current_user(request: Request) -> dict:
    """Get authenticated user from bearer header or JWT cookie. Raises 401 if not authenticated."""
    token = _extract_token(request)
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await DatabasePool.fetchrow(
        "SELECT id, email, name, picture, role FROM users WHERE id = $1",
        payload["sub"],
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return dict(user)


async def get_optional_user(request: Request) -> Optional[dict]:
    """Get user if authenticated, None otherwise."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def require_role(*roles: str):
    """Factory that creates a dependency requiring specific roles."""
    async def dependency(request: Request) -> dict:
        user = await get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency
