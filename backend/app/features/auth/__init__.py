"""auth slice — Google OAuth, JWT cookies, role guards.

Public surface:
- `router` — mount on the FastAPI app
- `get_current_user`, `get_optional_user`, `require_role` — FastAPI dependencies
- `create_jwt_token`, `verify_jwt_token` — JWT helpers (used by tests + fixtures)
- `UserRole` — role enum
"""
from .dependencies import get_current_user, get_optional_user, require_role
from .jwt import create_jwt_token, verify_jwt_token
from .models import UserRole
from .routes import router

__all__ = [
    "router",
    "get_current_user",
    "get_optional_user",
    "require_role",
    "create_jwt_token",
    "verify_jwt_token",
    "UserRole",
]
