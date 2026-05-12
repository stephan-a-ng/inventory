import pytest
from cryptography.fernet import Fernet

from app.shared import config, encryption


@pytest.fixture(autouse=True)
def _fresh_cipher(monkeypatch):
    monkeypatch.setattr(config, "POP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    encryption._Cipher.reset()
    yield
    encryption._Cipher.reset()


def test_roundtrip():
    plaintext = "mfp_7H3Q9KXM2BNV4LR8DPMS6TGY3W"
    ciphertext = encryption.encrypt_pop(plaintext)
    assert ciphertext != plaintext
    assert ciphertext.startswith("gAAAAA")
    assert encryption.decrypt_pop(ciphertext) == plaintext


def test_each_encryption_differs():
    plaintext = "mfp_7H3Q9KXM2BNV4LR8DPMS6TGY3W"
    a = encryption.encrypt_pop(plaintext)
    b = encryption.encrypt_pop(plaintext)
    assert a != b
    assert encryption.decrypt_pop(a) == encryption.decrypt_pop(b) == plaintext


def test_tampered_ciphertext_rejected():
    ciphertext = encryption.encrypt_pop("mfp_VALUE")
    tampered = ciphertext[:-4] + ("AAAA" if ciphertext[-4:] != "AAAA" else "BBBB")
    with pytest.raises(ValueError):
        encryption.decrypt_pop(tampered)


def test_wrong_key_rejected(monkeypatch):
    ciphertext = encryption.encrypt_pop("mfp_VALUE")
    monkeypatch.setattr(config, "POP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    encryption._Cipher.reset()
    with pytest.raises(ValueError):
        encryption.decrypt_pop(ciphertext)
