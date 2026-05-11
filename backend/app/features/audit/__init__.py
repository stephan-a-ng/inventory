"""audit slice — device audit trail.

Public surface:
- `router` — mount on the FastAPI app
- `AuditService` — `log_action()` is called by `devices` after every mutation
"""
from .routes import router
from .services import AuditService

# Convenience re-export — most callers want the function directly.
log_action = AuditService.log_action

__all__ = ["router", "AuditService", "log_action"]
