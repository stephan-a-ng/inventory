"""Pydantic models for request/response validation"""
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class ProductType(str, Enum):
    AEMS = "AEMS"
    BEMS = "BEMS"
    CHARGER = "CHARGER"
    NETWORKING = "NETWORKING"


class UserRole(str, Enum):
    ADMIN = "admin"
    TECHNICIAN = "technician"
    VIEWER = "viewer"


class DeviceCreate(BaseModel):
    mac_address: str = Field(..., pattern=r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
    product_type: ProductType
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    hardware_revision: Optional[str] = None
    current_stage_id: Optional[UUID] = None
    location: Optional[str] = None
    site_name: Optional[str] = None
    notes: Optional[str] = None


class DeviceUpdate(BaseModel):
    mac_address: Optional[str] = Field(None, pattern=r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
    product_type: Optional[ProductType] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    hardware_revision: Optional[str] = None
    current_stage_id: Optional[UUID] = None
    location: Optional[str] = None
    site_name: Optional[str] = None
    notes: Optional[str] = None


class DeviceOut(BaseModel):
    id: UUID
    mac_address: str
    device_name: Optional[str] = None
    product_type: ProductType
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    hardware_revision: Optional[str] = None
    current_stage_id: Optional[UUID] = None
    current_stage_name: Optional[str] = None
    location: Optional[str] = None
    site_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StageOut(BaseModel):
    id: UUID
    product_type: ProductType
    name: str
    order: int
    description: Optional[str] = None


class AuditLogOut(BaseModel):
    id: UUID
    device_id: UUID
    user_id: Optional[UUID] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    created_at: datetime


class BulkStageRequest(BaseModel):
    device_ids: list[UUID]
    stage_id: UUID


class DeviceListResponse(BaseModel):
    devices: list[DeviceOut]
    total: int
    page: int
    page_size: int


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
