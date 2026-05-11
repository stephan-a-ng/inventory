"""Subsystems-slice request/response models (also covers BoardRevision)."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel

from app.shared.models import ProductType


class SubsystemOut(BaseModel):
    id: UUID
    product_type: str
    name: str
    sort_order: int


class SubsystemCreate(BaseModel):
    product_type: ProductType
    name: str
    sort_order: Optional[int] = None


class SubsystemUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class BoardRevisionOut(BaseModel):
    id: UUID
    device_id: UUID
    subsystem_id: UUID
    subsystem_name: str
    revision: Optional[str] = None
    component_number: Optional[str] = None
    notes: Optional[str] = None
    updated_at: datetime


class BoardRevisionUpsert(BaseModel):
    subsystem_id: UUID
    revision: Optional[str] = None
    component_number: Optional[str] = None
    notes: Optional[str] = None
