"""stages slice — commissioning pipeline configuration.

Public surface:
- `router` — mount on the FastAPI app
- `StageService` — `advance_device_stage()` is called by devices when promoting a device
"""
from .routes import router
from .services import StageService

__all__ = ["router", "StageService"]
