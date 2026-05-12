"""users slice — admin user management.

Public surface:
- `router` — mount on the FastAPI app for /api/users endpoints
- `UserService` — list, role updates
"""
from .routes import router
from .services import UserService

__all__ = ["router", "UserService"]
