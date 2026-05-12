"""Unit tests for the Moon Five serial-number generator."""
from datetime import datetime, timezone

import pytest

from uuid import uuid4

from app.features.devices.serial_service import (
    CHECK_ALPHABET,
    PRODUCT_FAMILY,
    backfill_missing_serials,
    compose_serial,
    is_valid_serial,
    iso_week_stamp,
    luhn_check_letter,
    next_serial,
)


def test_iso_week_stamp_matches_known_dates():
    # 2026-05-11 is in ISO week 20 of 2026 (Mon → Sun spans).
    assert iso_week_stamp(datetime(2026, 5, 11, tzinfo=timezone.utc)) == "26W20"
    # 2027-02-23 → week 8 of 2027.
    assert iso_week_stamp(datetime(2027, 2, 23, tzinfo=timezone.utc)) == "27W08"
    # 2026-01-04 is a Sunday in ISO week 1 of 2026.
    assert iso_week_stamp(datetime(2026, 1, 4, tzinfo=timezone.utc)) == "26W01"


def test_product_family_covers_all_four_product_types():
    # The schema's CHECK constraint allows exactly these four product types.
    assert set(PRODUCT_FAMILY) == {"AEMS", "BEMS", "EVSE", "NETWORKING"}
    for code in PRODUCT_FAMILY.values():
        assert len(code) == 3 and code.isupper()


def test_check_letter_is_deterministic_for_a_fixed_body():
    body = "M5-BEM-G2-26W19-A-001234"
    first = luhn_check_letter(body)
    again = luhn_check_letter(body)
    assert first == again
    assert first in CHECK_ALPHABET


def test_check_letter_changes_when_body_changes():
    a = luhn_check_letter("M5-BEM-G2-26W19-A-001234")
    b = luhn_check_letter("M5-BEM-G2-26W19-A-001235")
    assert a != b


def test_check_letter_skips_ambiguous_chars():
    # No matter the input, the check digit is one of ABCDEFGHJK — never I or L,
    # never a digit, never O. That guarantee is part of the contract.
    seen = set()
    for seq in range(0, 200):
        body = f"M5-BEM-G2-26W19-A-{seq:06d}"
        seen.add(luhn_check_letter(body))
    assert seen <= set(CHECK_ALPHABET)
    forbidden = {"I", "L", "O", "0", "1"}
    assert seen.isdisjoint(forbidden)


def test_compose_serial_full_shape():
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)  # 26W20
    s = compose_serial(product_type="BEMS", sequence=1234, now=now)
    assert s.startswith("M5-BEM-G2-26W20-A-001234-")
    assert len(s.split("-")) == 7
    # Check digit at the tail is one alpha char.
    assert s[-1] in CHECK_ALPHABET


def test_compose_serial_honours_overrides():
    now = datetime(2027, 2, 23, tzinfo=timezone.utc)  # 27W08
    s = compose_serial(product_type="EVSE", sequence=2841, generation="G3", line="B", now=now)
    assert s.startswith("M5-EVS-G3-27W08-B-002841-")


@pytest.mark.parametrize("bad_pt", ["", "evs", "AEM", None])
def test_compose_rejects_unknown_product_type(bad_pt):
    with pytest.raises((ValueError, TypeError)):
        compose_serial(product_type=bad_pt, sequence=1)


def test_compose_rejects_out_of_range_sequence():
    with pytest.raises(ValueError):
        compose_serial(product_type="BEMS", sequence=-1)
    with pytest.raises(ValueError):
        compose_serial(product_type="BEMS", sequence=1_000_000)


def test_is_valid_serial_round_trips_what_compose_produces():
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)
    s = compose_serial(product_type="AEMS", sequence=87, now=now)
    assert is_valid_serial(s)


def test_is_valid_serial_rejects_bad_check_digit():
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)
    s = compose_serial(product_type="AEMS", sequence=87, now=now)
    # Flip the check digit to a different letter in CHECK_ALPHABET.
    wrong = next(c for c in CHECK_ALPHABET if c != s[-1])
    assert not is_valid_serial(s[:-1] + wrong)


def test_is_valid_serial_rejects_format_typos():
    assert not is_valid_serial("M5-BEM-G2-26W19-A-001234")          # missing check
    assert not is_valid_serial("M5-BEM-G2-26-A-001234-C")           # wrong week shape
    assert not is_valid_serial("AB-BEM-G2-26W19-A-001234-C")        # wrong prefix
    assert not is_valid_serial("")                                  # empty
    assert not is_valid_serial("M5-BEM-G2-26W19-A-12345-C")         # 5-digit seq


async def test_next_serial_starts_at_one_when_bucket_is_empty(mock_pool):
    mock_pool.fetch.return_value = []
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)  # 26W20
    out = await next_serial("BEMS", now=now)
    assert out.startswith("M5-BEM-G2-26W20-A-000001-")
    # The query is parameterised on the LIKE prefix.
    args = mock_pool.fetch.await_args.args
    assert args[1] == "M5-BEM-G2-26W20-A-"


async def test_next_serial_increments_past_existing_max(mock_pool):
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)  # 26W20
    mock_pool.fetch.return_value = [
        {"serial_number": "M5-BEM-G2-26W20-A-000001-A"},
        {"serial_number": "M5-BEM-G2-26W20-A-000007-K"},
        {"serial_number": "M5-BEM-G2-26W20-A-000003-D"},
        # An unrelated serial from another bucket shouldn't influence the max.
        {"serial_number": "M5-EVS-G3-27W08-B-099999-Z"},
    ]
    out = await next_serial("BEMS", now=now)
    assert out.startswith("M5-BEM-G2-26W20-A-000008-")


async def test_next_serial_passes_overrides_into_compose(mock_pool):
    mock_pool.fetch.return_value = []
    now = datetime(2027, 2, 23, tzinfo=timezone.utc)  # 27W08
    out = await next_serial("EVSE", generation="G3", line="B", now=now)
    assert out.startswith("M5-EVS-G3-27W08-B-000001-")


async def test_backfill_skips_when_no_rows_need_it(mock_pool):
    mock_pool.fetch.return_value = []
    n = await backfill_missing_serials()
    assert n == 0
    mock_pool.execute.assert_not_called()


async def test_backfill_assigns_a_serial_per_missing_device(mock_pool):
    dev_a, dev_b = uuid4(), uuid4()
    # First fetch: rows missing a serial.
    # Subsequent fetches: serial_service queries each bucket to find max seq.
    mock_pool.fetch.side_effect = [
        [
            {"id": dev_a, "product_type": "EVSE"},
            {"id": dev_b, "product_type": "BEMS"},
        ],
        [],  # EVSE bucket empty
        [],  # BEMS bucket empty
    ]
    n = await backfill_missing_serials()
    assert n == 2
    # Two UPDATEs, each setting serial_number on the right id.
    assert mock_pool.execute.await_count == 2
    first_call, second_call = mock_pool.execute.await_args_list
    assert first_call.args[2] == dev_a
    assert first_call.args[1].startswith("M5-EVS-G2-")
    assert second_call.args[2] == dev_b
    assert second_call.args[1].startswith("M5-BEM-G2-")


async def test_backfill_skips_unrecognised_product_types(mock_pool):
    mock_pool.fetch.side_effect = [
        [{"id": uuid4(), "product_type": "MYSTERY"}],
    ]
    n = await backfill_missing_serials()
    assert n == 0
    mock_pool.execute.assert_not_called()
