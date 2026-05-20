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


# ============================================================================
# Provisioning (host-side flash tool → POST /api/devices/provision)
# ============================================================================


class McuPayload(BaseModel):
    """One MCU's identity + boot diagnostics. All fields except role and
    wifi_sta_mac are optional — the firmware fills what it can collect,
    and forward-compatibility lets us add fields without breaking old tools.
    """
    role: str = Field(..., min_length=1, max_length=32)
    wifi_sta_mac: str = Field(..., pattern=r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
    bt_mac: Optional[str] = Field(None, pattern=r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")

    chip_type: Optional[str] = None
    chip_revision: Optional[int] = None

    flash_chip_id: Optional[int] = None
    flash_size: Optional[int] = None
    flash_mode: Optional[str] = None
    flash_freq_mhz: Optional[int] = None

    psram_size: Optional[int] = None
    psram_type: Optional[str] = None

    secure_boot_enabled: Optional[bool] = None
    flash_encryption_enabled: Optional[bool] = None

    active_partition: Optional[str] = None
    project_name: Optional[str] = None
    app_version: Optional[str] = None
    elf_sha256: Optional[str] = None
    idf_version: Optional[str] = None
    compile_date: Optional[str] = None
    compile_time: Optional[str] = None

    reset_reason: Optional[int] = None
    initial_heap_free: Optional[int] = None
    initial_largest_free_block: Optional[int] = None


class ProvisionRequest(BaseModel):
    """Body for POST /api/devices/provision. The host flash tool posts one
    payload per (re-)flash event containing every MCU it could observe on
    the device. The server upserts by any MCU's wifi_sta_mac — first
    provisioning event creates the device record, subsequent events update
    the per-MCU rows in place.
    """
    product_type: ProductType = ProductType.EVSE
    mcus: list[McuPayload] = Field(..., min_length=1)


class DeviceMcuOut(BaseModel):
    """One MCU's row as returned to API clients."""
    role: str
    wifi_sta_mac: str
    bt_mac: Optional[str] = None
    chip_type: Optional[str] = None
    chip_revision: Optional[int] = None
    flash_chip_id: Optional[int] = None
    flash_size: Optional[int] = None
    flash_mode: Optional[str] = None
    flash_freq_mhz: Optional[int] = None
    psram_size: Optional[int] = None
    psram_type: Optional[str] = None
    secure_boot_enabled: Optional[bool] = None
    flash_encryption_enabled: Optional[bool] = None
    active_partition: Optional[str] = None
    project_name: Optional[str] = None
    app_version: Optional[str] = None
    elf_sha256: Optional[str] = None
    idf_version: Optional[str] = None
    compile_date: Optional[str] = None
    compile_time: Optional[str] = None
    reset_reason: Optional[int] = None
    initial_heap_free: Optional[int] = None
    initial_largest_free_block: Optional[int] = None
    captured_at: datetime
    updated_at: datetime


class ProvisionResponse(BaseModel):
    """201 (created) or 200 (updated) response body. `pop` is plaintext
    and only returned on the create path — once a device has been
    provisioned, the POP becomes opaque and must be fetched via the
    existing GET /api/devices/{mac}/pop audit-logged endpoint.
    """
    device_id: UUID
    serial_number: Optional[str] = None
    device_name: Optional[str] = None
    pop: Optional[str] = None
    pop_generated_at: Optional[datetime] = None
    created: bool
    mcus: list[DeviceMcuOut]
