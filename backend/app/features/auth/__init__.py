"""auth slice — Google OAuth, JWT cookies, role guards.

Public surface:
- `router` — mount on the FastAPI app
- `get_current_user`, `get_optional_user`, `require_role` — FastAPI dependencies
- `require_api_key` — FastAPI dependency for headless API-key auth (flash tools, CI)
- `create_jwt_token`, `verify_jwt_token` — JWT helpers (used by tests + fixtures)
- `UserRole` — role enum
"""
from .api_key import require_api_key
from .dependencies import get_current_user, get_optional_user, require_role
from .jwt import create_jwt_token, verify_jwt_token
from .models import UserRole
from .routes import router

__all__ = [
    "router",
    "get_current_user",
    "get_optional_user",
    "require_role",
    "require_api_key",
    "create_jwt_token",
    "verify_jwt_token",
    "UserRole",
]
