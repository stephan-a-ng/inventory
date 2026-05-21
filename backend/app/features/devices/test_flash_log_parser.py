"""Unit tests for the pure-Python ESP-IDF log line parser.

No DB, no HTTP — these run fast on every commit and cover the shape
guarantees that the service + routes lean on.
"""
from __future__ import annotations

import pytest

from app.features.devices.flash_log_parser import (
    ParsedLine,
    parse_log_bytes,
    to_db_tuples,
)


# ---------------------------------------------------------------------------
# Standard ESP_LOGx shapes
# ---------------------------------------------------------------------------


def test_parses_canonical_info_line():
    out = parse_log_bytes(b"I (12345) main_mcu1: J1772 controller initialized\n")
    assert len(out) == 1
    assert out[0].level == "I"
    assert out[0].boot_ms == 12345
    assert out[0].tag == "main_mcu1"
    assert out[0].message == "J1772 controller initialized"
    assert out[0].raw == "I (12345) main_mcu1: J1772 controller initialized"
    assert out[0].line_no == 1


def test_parses_warning_and_error_levels():
    payload = (
        b"W (2705) INV: no response within 2000 ms\n"
        b"E (7079) CableLock: Feedback timeout (expected unlocked)\n"
    )
    out = parse_log_bytes(payload)
    assert [p.level for p in out] == ["W", "E"]
    assert out[0].tag == "INV"
    assert out[1].tag == "CableLock"


def test_parses_debug_level():
    out = parse_log_bytes(b"D (1) test_tag: debug message\n")
    assert out[0].level == "D"


def test_tag_with_dots_and_dashes():
    """ESP-IDF tags are usually plain word chars but components sometimes
    use namespaced or dashed names; the parser allows them."""
    out = parse_log_bytes(b"I (1) my.component-v2: hello\n")
    assert out[0].tag == "my.component-v2"
    assert out[0].message == "hello"


def test_message_can_contain_colons_and_braces():
    raw = b"I (1) INV: INVENTORY: pair {\"self_role\":\"mcu1\"}\n"
    out = parse_log_bytes(raw)
    assert out[0].tag == "INV"
    assert out[0].message == 'INVENTORY: pair {"self_role":"mcu1"}'


# ---------------------------------------------------------------------------
# Non-canonical shapes — never dropped, always become rows
# ---------------------------------------------------------------------------


def test_framing_marker_stays_raw_only():
    out = parse_log_bytes(b"=== watch_for_inventory on /dev/cu.usbserial-10 ===\n")
    assert len(out) == 1
    assert out[0].level is None
    assert out[0].tag is None
    assert out[0].boot_ms is None
    assert out[0].message is None
    assert out[0].raw == "=== watch_for_inventory on /dev/cu.usbserial-10 ==="


def test_bootloader_output_stays_raw_only():
    payload = (
        b"load:0x3fce2820,len:0x14f0\n"
        b"entry 0x40378ee4\n"
    )
    out = parse_log_bytes(payload)
    assert all(p.level is None for p in out)
    assert all(p.raw for p in out)


def test_panic_backtrace_lines_stay_raw_only():
    payload = (
        b"Guru Meditation Error: Core  0 panic'ed (StoreProhibited)\n"
        b"Backtrace: 0x4037fd2d:0x3fcb70c0 0x40380f31:0x3fcb70f0 |<-CORRUPTED\n"
    )
    out = parse_log_bytes(payload)
    assert all(p.level is None for p in out)
    assert "Guru Meditation" in out[0].raw
    assert "Backtrace" in out[1].raw


def test_blank_line_becomes_an_empty_raw_row():
    out = parse_log_bytes(b"\n")
    assert len(out) == 1
    assert out[0].raw == ""
    assert out[0].level is None


def test_crlf_line_endings_stripped():
    out = parse_log_bytes(b"I (1) tag: hi\r\n")
    assert out[0].raw == "I (1) tag: hi"
    assert out[0].message == "hi"


# ---------------------------------------------------------------------------
# Multiline + ordering invariants
# ---------------------------------------------------------------------------


def test_line_numbers_are_sequential_and_one_based():
    payload = b"first\nsecond\nthird\n"
    out = parse_log_bytes(payload)
    assert [p.line_no for p in out] == [1, 2, 3]


def test_does_not_drop_trailing_line_without_newline():
    out = parse_log_bytes(b"I (1) tag: line1\nI (2) tag: line2")
    assert len(out) == 2
    assert out[-1].message == "line2"


def test_realistic_mixed_capture_round_trip():
    """Mini scenario: framing marker, two standard lines, a bootloader-
    style line, a panic, a blank line. All six become rows."""
    payload = (
        b"=== watching /dev/cu.usbserial-10 ===\n"
        b"I (667) atm90e32: Calibration applied\n"
        b"W (5453) INV: no response within 2000 ms\n"
        b"load:0x3fce2820,len:0x14f0\n"
        b"\n"
        b"E (9999) panic: oh no\n"
    )
    out = parse_log_bytes(payload)
    assert len(out) == 6
    # parsed
    assert (out[1].level, out[1].tag) == ("I", "atm90e32")
    assert (out[2].level, out[2].tag) == ("W", "INV")
    assert (out[5].level, out[5].tag) == ("E", "panic")
    # raw-only
    assert out[0].level is None
    assert out[3].level is None
    assert out[4].level is None and out[4].raw == ""


# ---------------------------------------------------------------------------
# DB tuple projection — column ordering matters for copy_records_to_table
# ---------------------------------------------------------------------------


def test_to_db_tuples_column_order():
    from datetime import datetime, timezone
    from uuid import UUID

    parsed = [
        ParsedLine(line_no=1, raw="hi", level="I", boot_ms=1, tag="t", message="hi"),
        ParsedLine(line_no=2, raw="something raw"),  # unparsed line
    ]
    flash_log_id = UUID("11111111-1111-1111-1111-111111111111")
    device_id = UUID("22222222-2222-2222-2222-222222222222")
    captured = datetime(2026, 5, 21, tzinfo=timezone.utc)

    tuples = to_db_tuples(
        parsed, flash_log_id=flash_log_id, device_id=device_id,
        mcu_role="mcu1", captured_at=captured,
    )

    # (flash_log_id, device_id, mcu_role, line_no, boot_ms, level, tag, message, raw, captured_at)
    assert tuples[0] == (
        flash_log_id, device_id, "mcu1", 1, 1, "I", "t", "hi", "hi", captured,
    )
    # Unparsed line: all parsed columns are None, raw still populated.
    assert tuples[1] == (
        flash_log_id, device_id, "mcu1", 2, None, None, None, None, "something raw", captured,
    )


# ---------------------------------------------------------------------------
# Regression: real captured log
# ---------------------------------------------------------------------------


def test_parses_a_chunk_of_real_capture():
    """Sanity-check against a slice of the actual capture we have on disk
    — confirms the 88%-parseable claim from the validation phase isn't
    aspirational."""
    sample = b"""=== watching /dev/cu.usbserial-10 for INVENTORY line (cap 120s) ===
I (667) atm90e32: Calibration applied (mmode0=0x
I (676) atm90e32_calib: Calibration restored from NVS (namespace: 'atm90e32', key: 'calibration')
I (687) atm90e32: Calibration applied (mmode0=0x1485, mmode1=0x002A)
I (690) main_mcu1: Calibration: mmode0=0x1485 (60Hz, Rogowski, EnPA=1 EnPB=0 EnPC=1)
I (3435) INV: init self_role=mcu1 wifi_mac=fc:01:2c:ca:bd:88 app_version=v0.0.10-21-g1f870add
W (5453) INV: no response within 2000 ms
E (7079) CableLock: Feedback timeout (expected unlocked)
"""
    out = parse_log_bytes(sample)
    parsed = [p for p in out if p.level is not None]
    unparsed = [p for p in out if p.level is None]
    # 7 ESP_LOGx lines parse; the framing marker doesn't.
    assert len(parsed) == 7
    assert len(unparsed) == 1
    assert unparsed[0].raw.startswith("===")
    # Spot-check a couple of fields.
    assert parsed[0].tag == "atm90e32"
    assert any(p.level == "E" and p.tag == "CableLock" for p in parsed)
