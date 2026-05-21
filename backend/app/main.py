"""MoonFive Inventory Manager API — entry point.

Mounts each feature slice's router via its barrel. Slice internals are private;
this file imports nothing from feature internals.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.features.audit import router as audit_router
from app.features.auth import router as auth_router
from app.features.build_steps import router as build_steps_router
from app.features.devices import (
    firmware_router as device_firmware_router,
    flash_log_router as device_flash_log_router,
    notes_router as device_notes_router,
    qr_router,
    router as devices_router,
)
from app.features.devices.serial_service import backfill_missing_serials
from app.features.devices.uuid_backfill import backfill_v4_ids_to_v7
from app.features.stages import router as stages_router
from app.features.subsystems import board_revision_router, router as subsystems_router
from app.features.users import router as users_router
from app.shared.config import FRONTEND_URL
from app.shared.db import DatabasePool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await DatabasePool.initialize()
    schema_path = Path(__file__).parent / "shared" / "schema.sql"
    async with DatabasePool._pool.acquire() as conn:
        await conn.execute(schema_path.read_text())
    # Backfill any devices created before the serial-generator was wired
    # in — idempotent, so safe to run on every boot.
    backfilled = await backfill_missing_serials()
    if backfilled:
        print(f"[startup] backfilled {backfilled} device serial(s)")
    # Migrate legacy v4 primary keys to v7 (cascades via FKs).
    rewritten = await backfill_v4_ids_to_v7()
    if rewritten:
        print(f"[startup] rewrote {rewritten} device id(s) to UUIDv7")
    yield
    await DatabasePool.close()


app = FastAPI(title="MoonFive Inventory", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:5174", "http://localhost:5180", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(devices_router)
app.include_router(qr_router)
app.include_router(device_notes_router)
app.include_router(device_firmware_router)
app.include_router(device_flash_log_router)
app.include_router(audit_router)
app.include_router(stages_router)
app.include_router(subsystems_router)
app.include_router(board_revision_router)
app.include_router(users_router)
app.include_router(build_steps_router)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "inventory"}
