"""UUID version 7 generator.

UUIDv7 (RFC 9562) encodes a 48-bit Unix-ms timestamp in the high bits,
followed by 74 bits of randomness and 6 bits of version/variant. The time
ordering means primary keys cluster naturally and indexes stay hot.

Python's stdlib will gain `uuid.uuid7()` in 3.14; this module is the
backport until we can drop our 3.12 baseline.

Layout (128 bits, MSB-first):

    | 48 bits unix_ts_ms | 4 bits ver(0x7) | 12 bits rand_a |
    | 2 bits variant(0b10) | 62 bits rand_b |
"""
from __future__ import annotations

import os
import time
from typing import Optional
from uuid import UUID


def uuid7(*, ts_ms: Optional[int] = None) -> UUID:
    """Return a fresh UUIDv7.

    `ts_ms` may be supplied for deterministic tests; otherwise the current
    Unix time in milliseconds is used.
    """
    if ts_ms is None:
        ts_ms = int(time.time() * 1000)
    if not (0 <= ts_ms < (1 << 48)):
        raise ValueError("ts_ms must fit in 48 bits")

    # 12 bits of randomness for rand_a + 62 bits for rand_b = 74 bits total.
    rand_a = int.from_bytes(os.urandom(2), "big") & 0x0FFF
    rand_b = int.from_bytes(os.urandom(8), "big") & ((1 << 62) - 1)

    value = (
        (ts_ms << 80)
        | (0x7 << 76)
        | (rand_a << 64)
        | (0b10 << 62)
        | rand_b
    )
    return UUID(int=value)
