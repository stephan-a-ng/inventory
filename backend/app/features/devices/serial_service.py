"""Moon Five serial-number generator.

Format (see docs/claude/SERIAL-NUMBERS.md):

    M5-{family}-{generation}-{YYWW}-{line}-{seq6}-{check}

Example:

    M5-BEM-G2-26W19-A-001234-C

The check digit is computed with Luhn mod-10 over the body's character values
(0-9 stay; A-Z map to 10-35; non-alphanumerics are skipped), then mapped to a
single unambiguous letter (A B C D E F G H J K — I and L omitted to avoid
'1/l' / 'I/l' read errors).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from app.shared.db import DatabasePool

# Convention: AEMS → AEM, BEMS → BEM, EVSE → EVS, NETWORKING → NET.
# NETWORKING isn't in the original convention doc; NET is the obvious mirror
# and follows the three-letter shape.
PRODUCT_FAMILY: dict[str, str] = {
    "AEMS": "AEM",
    "BEMS": "BEM",
    "EVSE": "EVS",
    "NETWORKING": "NET",
}

DEFAULT_GENERATION = "G2"
DEFAULT_LINE = "A"

# Ten unambiguous letters mapped to Luhn check values 0..9. We skip I and L
# (read errors against 1 / l) and O (against 0). We keep this strictly alpha
# so the check digit segment is always a single letter — matches the spec's
# examples (C, K, M).
CHECK_ALPHABET = "ABCDEFGHJK"

# Strict regex for a fully-formed serial.
SERIAL_REGEX = re.compile(
    r"^M5-(?P<family>[A-Z]{3})-(?P<generation>G\d+)-"
    r"(?P<yww>\d{2}W\d{2})-(?P<line>[A-Z])-(?P<seq>\d{6})-"
    r"(?P<check>[A-Z])$"
)


def iso_week_stamp(now: Optional[datetime] = None) -> str:
    """Return YYWW for the given moment, e.g. ``26W19``."""
    now = now or datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()
    return f"{iso_year % 100:02d}W{iso_week:02d}"


def _char_value(ch: str) -> int:
    """Digit value for the Luhn computation: 0-9 stay; A-Z → 10-35."""
    if ch.isdigit():
        return int(ch)
    return ord(ch.upper()) - ord("A") + 10


def luhn_check_letter(body: str) -> str:
    """Compute the Moon Five check letter for a serial body.

    `body` is the hyphenated serial without the trailing ``-{check}``.
    Hyphens and other non-alphanumerics are stripped before scoring.
    """
    payload = "".join(ch for ch in body.upper() if ch.isalnum())
    # Luhn: starting from the rightmost payload digit, double every second
    # digit; sum the resulting digits. Add to the running total alongside the
    # non-doubled digits. The check value brings the total to a multiple of 10.
    total = 0
    for i, ch in enumerate(reversed(payload)):
        v = _char_value(ch)
        if i % 2 == 0:
            # Doubled position. Split tens for >9 values so a 10..35 input
            # contributes the sum of its digit pair, matching standard Luhn.
            doubled = v * 2
            total += (doubled // 10) + (doubled % 10)
        else:
            total += (v // 10) + (v % 10)
    check_val = (10 - (total % 10)) % 10
    return CHECK_ALPHABET[check_val]


def compose_serial(
    *,
    product_type: str,
    sequence: int,
    generation: str = DEFAULT_GENERATION,
    line: str = DEFAULT_LINE,
    now: Optional[datetime] = None,
) -> str:
    """Build a full serial including check digit for the given inputs.

    Raises ValueError on unknown product_type or bad sequence range.
    """
    family = PRODUCT_FAMILY.get(product_type)
    if not family:
        raise ValueError(f"No family code mapping for product_type={product_type!r}")
    if sequence < 0 or sequence > 999_999:
        raise ValueError(f"sequence out of range 0..999999: {sequence!r}")
    if not re.fullmatch(r"G\d+", generation):
        raise ValueError(f"generation must look like G2/G3/…: {generation!r}")
    if not re.fullmatch(r"[A-Z]", line):
        raise ValueError(f"line must be a single A-Z letter: {line!r}")

    yww = iso_week_stamp(now)
    body = f"M5-{family}-{generation}-{yww}-{line}-{sequence:06d}"
    return f"{body}-{luhn_check_letter(body)}"


def is_valid_serial(serial: str) -> bool:
    """Return True iff ``serial`` matches the format AND the check digit verifies."""
    if not serial:
        return False
    m = SERIAL_REGEX.match(serial.upper())
    if not m:
        return False
    body, check = serial.upper().rsplit("-", 1)
    return luhn_check_letter(body) == check


async def backfill_missing_serials() -> int:
    """Assign Moon Five serials to any device that's missing one.

    Idempotent — only touches rows where `serial_number IS NULL`. Runs at
    app startup (see app/main.py). Each device gets a serial in its current
    (product_type, ISO week) bucket; we process rows oldest-first so the
    sequence reflects insertion order.

    Returns the number of devices updated.
    """
    # Treat blanks the same as NULL — the API surfaces optional and the
    # frontend has been known to POST an empty string when the user leaves
    # the field blank.
    rows = await DatabasePool.fetch(
        """SELECT id, product_type FROM devices
            WHERE serial_number IS NULL OR length(trim(serial_number)) = 0
            ORDER BY created_at ASC, id ASC"""
    )
    updated = 0
    for r in rows:
        product_type = r["product_type"]
        if product_type not in PRODUCT_FAMILY:
            # Unrecognised product type — skip rather than fail startup.
            continue
        serial = await next_serial(product_type)
        await DatabasePool.execute(
            """UPDATE devices SET serial_number = $1
                WHERE id = $2
                  AND (serial_number IS NULL OR length(trim(serial_number)) = 0)""",
            serial, r["id"],
        )
        updated += 1
    return updated


async def next_serial(
    product_type: str,
    *,
    generation: str = DEFAULT_GENERATION,
    line: str = DEFAULT_LINE,
    now: Optional[datetime] = None,
) -> str:
    """Compute the next available serial for the (product_type, gen, week, line).

    The sequence is the maximum-seen sequence within that bucket plus one.
    Concurrency: callers should retry on unique-constraint conflicts if a
    constraint is later added — for now `serial_number` is nullable and not
    unique-constrained, so collisions are not surfaced at write time.
    """
    family = PRODUCT_FAMILY.get(product_type)
    if not family:
        raise ValueError(f"No family code mapping for product_type={product_type!r}")
    yww = iso_week_stamp(now)
    prefix = f"M5-{family}-{generation}-{yww}-{line}-"
    rows = await DatabasePool.fetch(
        """SELECT serial_number FROM devices
            WHERE serial_number LIKE $1 || '%'""",
        prefix,
    )
    max_seq = 0
    for r in rows:
        s = r["serial_number"]
        if not s or not s.startswith(prefix):
            continue
        # Strip the prefix, then peel off the leading 6-digit sequence.
        tail = s[len(prefix):]
        seq_part = tail.split("-", 1)[0]
        if seq_part.isdigit():
            n = int(seq_part)
            if n > max_seq:
                max_seq = n
    return compose_serial(
        product_type=product_type,
        sequence=max_seq + 1,
        generation=generation,
        line=line,
        now=now,
    )
