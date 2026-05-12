"""Auth-slice models."""
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    TECHNICIAN = "technician"
    INSTALLER = "installer"
    VIEWER = "viewer"
