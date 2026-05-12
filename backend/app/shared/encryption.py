"""Symmetric encryption for at-rest secrets (PoP values).

Uses cryptography.fernet which is AES-128-CBC + HMAC-SHA256 with a 32-byte
url-safe-base64 key.

The key lives in env var POP_ENCRYPTION_KEY (Secret Manager in deployed envs).
Rotating the key invalidates all existing ciphertexts — see SECURITY.md.
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.shared import config


class _Cipher:
    _instance: Fernet | None = None

    @classmethod
    def get(cls) -> Fernet:
        if cls._instance is None:
            cls._instance = Fernet(config.POP_ENCRYPTION_KEY.encode())
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None


def encrypt_pop(plaintext: str) -> str:
    return _Cipher.get().encrypt(plaintext.encode()).decode()


def decrypt_pop(ciphertext: str) -> str:
    try:
        return _Cipher.get().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Invalid or tampered PoP ciphertext") from exc
