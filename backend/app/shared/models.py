"""Shared enums used across slices."""
from enum import Enum


class ProductType(str, Enum):
    AEMS = "AEMS"
    BEMS = "BEMS"
    EVSE = "EVSE"
    NETWORKING = "NETWORKING"
