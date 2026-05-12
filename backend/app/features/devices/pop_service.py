"""Per-device PoP (proof-of-possession) generator.

Format: `mfp_<26 chars Crockford base32>` — 30 chars total, 128 bits of entropy.
The `mfp_` prefix makes leaked PoPs grep-able in logs.

See docs/claude/SECURITY.md and the sibling spec at
installer-app/docs/inventory-pop-api.md §2.
"""
from __future__ import annotations

import secrets

# Crockford base32: no ambiguous 0/O, 1/I/L, U.
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def generate_pop() -> str:
    raw = secrets.token_bytes(16)
    n = int.from_bytes(raw, "big")
    chars: list[str] = []
    for _ in range(26):
        chars.append(_ALPHABET[n & 0x1F])
        n >>= 5
    return "mfp_" + "".join(reversed(chars))
