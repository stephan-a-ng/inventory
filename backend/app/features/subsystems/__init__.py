"""subsystems slice — subsystems and per-device board revisions.

Public surface:
- `router` — subsystem CRUD routes
- `board_revision_router` — per-device board revision routes (mount alongside `router`)
- `SubsystemService`, `BoardRevisionService` — used by tests
"""
from .board_revision_routes import router as board_revision_router
from .board_revision_service import BoardRevisionService
from .routes import router
from .services import SubsystemService

__all__ = [
    "router",
    "board_revision_router",
    "SubsystemService",
    "BoardRevisionService",
]
