"""Unit tests for JWT helpers."""
from app.features.auth.jwt import create_jwt_token, verify_jwt_token


def test_roundtrip():
    token = create_jwt_token("user-123", "alice@moonfive.tech", role="admin")
    payload = verify_jwt_token(token)
    assert payload is not None
    assert payload["sub"] == "user-123"
    assert payload["email"] == "alice@moonfive.tech"
    assert payload["role"] == "admin"


def test_default_role_is_viewer():
    token = create_jwt_token("u1", "bob@example.com")
    payload = verify_jwt_token(token)
    assert payload["role"] == "viewer"


def test_invalid_token_returns_none():
    assert verify_jwt_token("not-a-jwt") is None
    assert verify_jwt_token("") is None


def test_tampered_token_returns_none():
    token = create_jwt_token("u1", "bob@example.com")
    tampered = token[:-4] + "XXXX"
    assert verify_jwt_token(tampered) is None
