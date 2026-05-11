"""devices slice — device CRUD, QR codes, CSV import/export.

Public surface:
- `router` — main device routes (mount on the FastAPI app)
- `qr_router` — QR code sub-resource routes (separately mountable)
- `DeviceService`, `CsvService` — used by tests and (rarely) cross-slice
"""
from .csv_service import CsvService
from .qr_routes import router as qr_router
from .routes import router
from .services import DeviceService

__all__ = ["router", "qr_router", "DeviceService", "CsvService"]
