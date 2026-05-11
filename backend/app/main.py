"""MoonFive Inventory Manager API"""
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import FRONTEND_URL
from app.database import DatabasePool
from app.routes.auth import router as auth_router
from app.routes.devices import router as devices_router
from app.routes.audit import router as audit_router
from app.routes.qr import router as qr_router
from app.routes.stages import router as stages_router
from app.routes.subsystems import router as subsystems_router
from app.routes.board_revisions import router as board_revisions_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await DatabasePool.initialize()
    # Run schema migration
    schema_path = Path(__file__).parent / "schema.sql"
    async with DatabasePool._pool.acquire() as conn:
        await conn.execute(schema_path.read_text())
    yield
    await DatabasePool.close()

app = FastAPI(title="MoonFive Inventory", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(devices_router)
app.include_router(audit_router)
app.include_router(qr_router)
app.include_router(stages_router)
app.include_router(subsystems_router)
app.include_router(board_revisions_router)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "inventory"}
