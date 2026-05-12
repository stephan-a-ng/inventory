"""Coverage for the UUIDv7 generator."""
from uuid import UUID

import pytest

from app.shared.uuid7 import uuid7


def test_returns_a_uuid_with_version_7():
    u = uuid7()
    assert isinstance(u, UUID)
    assert u.version == 7
    assert u.variant == "specified in RFC 4122"  # variant 0b10


def test_unix_timestamp_is_encoded_in_high_48_bits():
    ts = 1_730_000_000_000  # arbitrary fixed ms
    u = uuid7(ts_ms=ts)
    # The top 48 bits should equal the timestamp.
    high_48 = u.int >> 80
    assert high_48 == ts


def test_two_calls_are_different_even_at_same_timestamp():
    ts = 1_730_000_000_000
    a = uuid7(ts_ms=ts)
    b = uuid7(ts_ms=ts)
    assert a != b  # 74 bits of randomness — collision odds are astronomical


def test_uuids_sort_by_creation_time():
    # Two timestamps 100ms apart — earlier UUID must compare less than later.
    earlier = uuid7(ts_ms=1_730_000_000_000)
    later = uuid7(ts_ms=1_730_000_000_100)
    assert earlier < later


def test_rejects_out_of_range_timestamp():
    with pytest.raises(ValueError):
        uuid7(ts_ms=-1)
    with pytest.raises(ValueError):
        uuid7(ts_ms=1 << 48)
