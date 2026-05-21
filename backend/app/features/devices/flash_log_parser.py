"""Parse ESP-IDF serial-console captures into structured line rows.

The flash tool uploads the raw bytes captured by `flash_provision.py`'s
boot-watch + post-INVENTORY tail. ESP-IDF's logging convention is:

    I (12345) main_mcu1: J1772 controller initialized
    │  │     │           └── message (rest of line)
    │  │     └── tag (component or task name)
    │  └── ms since chip reset
    └── level: I (INFO) / W (WARN) / E (ERROR) / D (DEBUG)

The parser is intentionally permissive: anything that doesn't match the
canonical shape — bootloader output, panic backtraces, our own
`=== watch_for_inventory ===` framing markers, blank lines — still
becomes a row, just with all parsed columns NULL and the original text
preserved in `raw`. The point is forensic completeness; we never drop
data on the floor.

Pure-Python, no DB or HTTP. The service layer takes a `bytes` payload
and a base `captured_at`, calls `parse_log_bytes()`, and bulk-inserts
the resulting rows.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional


# Examples that match:
#   I (12345) main_mcu1: J1772 initialized
#   W (2705) INV: no response within 2000 ms
#   E (7079) CableLock: Feedback timeout
# Examples that don't (and stay raw-only):
#   === watching /dev/cu.usbserial-10 for INVENTORY line (cap 120s) ===
#   load:0x3fce2820,len:0x14f0
#   Backtrace: 0x4037fd2d:0x3fcb70c0 |<-CORRUPTED
#   (blank lines)
_LINE_RE = re.compile(
    r"""^
    (?P<level>[IWED])      # level char
    \s\(                   # space + open paren
    (?P<boot_ms>\d+)       # boot_ms (digits only, no dots — system-time format
                           # with `(HH:MM:SS.mmm)` is rare in factory captures
                           # but we'd fall through to raw-only if seen)
    \)\s                   # close paren + space
    (?P<tag>[\w.\-+]+)     # tag — alphanumerics and a few separators
    :\s                    # colon + space
    (?P<message>.*)        # rest of line (already \n-stripped by caller)
    $""",
    re.VERBOSE,
)


@dataclass
class ParsedLine:
    line_no: int
    raw: str
    boot_ms: Optional[int] = None
    level: Optional[str] = None
    tag: Optional[str] = None
    message: Optional[str] = None


def parse_log_bytes(payload: bytes) -> list[ParsedLine]:
    """Split `payload` on newlines and parse each. Returns one entry per
    physical line, including blank lines (they become raw='' rows).

    UTF-8 is assumed; bytes that fail to decode get replaced rather than
    raising — a malformed byte in a 100 KB log shouldn't cost the whole
    upload."""
    text = payload.decode("utf-8", errors="replace")
    return _parse_text(text)


def _parse_text(text: str) -> list[ParsedLine]:
    out: list[ParsedLine] = []
    for ordinal, raw in enumerate(text.splitlines(), start=1):
        out.append(_parse_one(ordinal, raw))
    return out


def _parse_one(ordinal: int, raw_line: str) -> ParsedLine:
    # Strip carriage returns from CRLF-terminated lines but keep the rest
    # verbatim — leading whitespace can be diagnostically interesting
    # (e.g., continuation lines from a stack trace).
    raw = raw_line.rstrip("\r")
    m = _LINE_RE.match(raw)
    if not m:
        return ParsedLine(line_no=ordinal, raw=raw)
    return ParsedLine(
        line_no=ordinal,
        raw=raw,
        level=m.group("level"),
        boot_ms=int(m.group("boot_ms")),
        tag=m.group("tag"),
        message=m.group("message"),
    )


def to_db_tuples(
    parsed: Iterable[ParsedLine],
    *,
    flash_log_id,
    device_id,
    mcu_role: str,
    captured_at,
) -> list[tuple]:
    """Project ParsedLine objects into tuples shaped for asyncpg's
    `copy_records_to_table` against `device_flash_log_lines`.

    Column order MUST match the table definition (sans the BIGSERIAL id):
        flash_log_id, device_id, mcu_role, line_no, boot_ms, level,
        tag, message, raw, captured_at
    """
    return [
        (
            flash_log_id,
            device_id,
            mcu_role,
            p.line_no,
            p.boot_ms,
            p.level,
            p.tag,
            p.message,
            p.raw,
            captured_at,
        )
        for p in parsed
    ]
