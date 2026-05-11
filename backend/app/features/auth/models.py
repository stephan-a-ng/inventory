"""Auth-slice models."""
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    TECHNICIAN = "technician"
    VIEWER = "viewer"
