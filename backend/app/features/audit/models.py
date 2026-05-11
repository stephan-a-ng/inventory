"""Audit-slice response models."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


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
