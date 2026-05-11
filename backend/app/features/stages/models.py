"""Stages-slice request/response models."""
from typing import Optional
from uuid import UUID

from pydantic import BaseModel

from app.shared.models import ProductType


class StageOut(BaseModel):
    id: UUID
    product_type: ProductType
    name: str
    order: int
    description: Optional[str] = None


class StageCreate(BaseModel):
    product_type: str
    name: str
    description: Optional[str] = None


class StageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None
