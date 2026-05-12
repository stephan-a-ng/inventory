"""Devices-slice request/response models."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.shared.models import ProductType


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
    firmware_deviation_reason: Optional[str] = None


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
    firmware_deviation_reason: Optional[str] = None


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
    firmware_deviation_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DeviceListResponse(BaseModel):
    devices: list[DeviceOut]
    total: int
    page: int
    page_size: int


class BulkStageRequest(BaseModel):
    device_ids: list[UUID]
    stage_id: UUID
