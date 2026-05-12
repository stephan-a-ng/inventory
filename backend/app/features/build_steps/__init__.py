"""build_steps slice — per-revision authoring of work instructions and
worker-side progress through Assembly / Firmware / Calibration stages.

Public surface:
- `router` — mount on the FastAPI app
"""
from .routes import router

__all__ = ["router"]
