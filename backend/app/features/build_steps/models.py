"""build_steps-slice request/response models.

Three resources:
- product_revisions: canonical hardware revisions per product type
- firmware_versions: registered firmware builds per revision (one is_standard)
- build_steps: ordered work instructions per (revision, stage_key)
"""
from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.shared.models import ProductType

StageKey = Literal["Assembly", "Firmware", "Calibration"]


# ── product_revisions ────────────────────────────────────────────────────────
class ProductRevisionCreate(BaseModel):
    product_type: ProductType
    label: str = Field(min_length=1, max_length=64)
    notes: Optional[str] = None
    is_default: bool = False


class ProductRevisionUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=64)
    notes: Optional[str] = None


class ProductRevisionOut(BaseModel):
    id: UUID
    product_type: ProductType
    label: str
    notes: Optional[str] = None
    is_default: bool
    created_at: datetime
    updated_at: datetime


# ── firmware_versions ────────────────────────────────────────────────────────
class FirmwareVersionCreate(BaseModel):
    version: str = Field(min_length=1, max_length=64)
    notes: Optional[str] = None
    is_standard: bool = False
    released_at: Optional[date] = None


class FirmwareVersionUpdate(BaseModel):
    version: Optional[str] = Field(default=None, min_length=1, max_length=64)
    notes: Optional[str] = None
    released_at: Optional[date] = None


class FirmwareVersionOut(BaseModel):
    id: UUID
    product_revision_id: UUID
    version: str
    notes: Optional[str] = None
    is_standard: bool
    released_at: Optional[date] = None
    created_at: datetime
    updated_at: datetime


# ── instruction sets ─────────────────────────────────────────────────────────
class InstructionSetCreate(BaseModel):
    product_revision_id: UUID
    stage_key: StageKey
    label: str = Field(min_length=1, max_length=64)
    is_active: bool = False


class InstructionSetUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=64)


class InstructionSetClone(BaseModel):
    label: str = Field(min_length=1, max_length=64)
    activate: bool = True


class InstructionSetOut(BaseModel):
    id: UUID
    product_revision_id: UUID
    stage_key: StageKey
    label: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── build_steps ──────────────────────────────────────────────────────────────
class BuildStepCreate(BaseModel):
    instruction_set_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    required_photo_count: int = Field(default=0, ge=0, le=10)


class BuildStepUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    required_photo_count: Optional[int] = Field(default=None, ge=0, le=10)
    sort_order: Optional[int] = None


class BuildStepReorder(BaseModel):
    ids: list[UUID]


class BuildStepOut(BaseModel):
    id: UUID
    instruction_set_id: UUID
    sort_order: int
    title: str
    description: Optional[str] = None
    reference_photo_key: Optional[str] = None
    required_photo_count: int
    created_at: datetime
    updated_at: datetime


# ── build_sub_steps ──────────────────────────────────────────────────────────
class BuildSubStepCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class BuildSubStepUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    sort_order: Optional[int] = None


class BuildSubStepReorder(BaseModel):
    ids: list[UUID]


class BuildSubStepOut(BaseModel):
    id: UUID
    build_step_id: UUID
    sort_order: int
    title: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ── worker progress ──────────────────────────────────────────────────────────
class StepStatusToggle(BaseModel):
    checked: bool


class DeviceStepStatusOut(BaseModel):
    build_step_id: UUID
    checked: bool
    checked_at: Optional[datetime] = None
    checked_by_user_id: Optional[UUID] = None


class DevicePhotoOut(BaseModel):
    id: UUID
    build_step_id: UUID
    photo_key: str
    url: Optional[str] = None  # populated when GCS signing is wired (Phase B)
    caption: Optional[str] = None
    taken_by_user_id: Optional[UUID] = None
    taken_at: datetime


class WorkerStepView(BaseModel):
    """Merged step + per-device progress, sent to the worker walkthrough."""

    step: BuildStepOut
    status: DeviceStepStatusOut
    photos: list[DevicePhotoOut]
