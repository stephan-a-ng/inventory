"""Tests for POST /api/auth/mobile/google.

The Google ID-token verifier is patched at the module boundary so we don't
make real JWKS calls. Verification logic lives in google_id_token.py and is
exercised separately at the helper level.
"""
import pytest
from fastapi import HTTPException

from app.features.auth import google_id_token


CLIENT_ID_IOS = "test-ios.apps.googleusercontent.com"
CLIENT_ID_ANDROID = "test-android.apps.googleusercontent.com"


@pytest.fixture(autouse=True)
def _mobile_client_ids(monkeypatch):
    monkeypatch.setattr(
        "app.shared.config.MOBILE_GOOGLE_CLIENT_ID_IOS", CLIENT_ID_IOS
    )
    monkeypatch.setattr(
        "app.shared.config.MOBILE_GOOGLE_CLIENT_ID_ANDROID", CLIENT_ID_ANDROID
    )


def _patch_verifier(monkeypatch, claims=None, raises=None):
    def fake(token, allowed):
        if raises:
            raise raises
        return claims or {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID_IOS,
            "email": "installer@partner.com",
            "email_verified": True,
            "name": "Inst",
        }
    monkeypatch.setattr(
        "app.features.auth.routes.verify_google_id_token", fake
    )


async def test_mobile_auth_success_for_installer(client, auth_user, monkeypatch):
    user, _ = await auth_user(role="installer", email="installer@partner.com")
    _patch_verifier(monkeypatch)

    resp = await client.post("/api/auth/mobile/google", json={"id_token": "fake"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["token_type"] == "Bearer"
    assert data["user"]["role"] == "installer"
    assert data["user"]["email"] == "installer@partner.com"
    assert data["access_token"]


async def test_mobile_auth_success_for_admin(client, auth_user, monkeypatch):
    await auth_user(role="admin", email="admin@moonfive.tech")
    _patch_verifier(monkeypatch, claims={
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID_ANDROID,
        "email": "admin@moonfive.tech",
        "email_verified": True,
    })

    resp = await client.post("/api/auth/mobile/google", json={"id_token": "fake"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "admin"


async def test_mobile_auth_missing_id_token(client, monkeypatch):
    resp = await client.post("/api/auth/mobile/google", json={"id_token": ""})
    assert resp.status_code == 400
    assert "id_token" in resp.json()["detail"]


async def test_mobile_auth_invalid_token(client, monkeypatch):
    _patch_verifier(
        monkeypatch, raises=HTTPException(status_code=401, detail="Invalid Google ID token")
    )
    resp = await client.post("/api/auth/mobile/google", json={"id_token": "garbage"})
    assert resp.status_code == 401


async def test_mobile_auth_unknown_user_rejected(client, integration_pool, monkeypatch):
    _patch_verifier(monkeypatch, claims={
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID_IOS,
        "email": "stranger@example.com",
        "email_verified": True,
    })
    resp = await client.post("/api/auth/mobile/google", json={"id_token": "fake"})
    assert resp.status_code == 403


async def test_mobile_auth_viewer_rejected(client, auth_user, monkeypatch):
    await auth_user(role="viewer", email="viewer@partner.com")
    _patch_verifier(monkeypatch, claims={
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID_IOS,
        "email": "viewer@partner.com",
        "email_verified": True,
    })
    resp = await client.post("/api/auth/mobile/google", json={"id_token": "fake"})
    assert resp.status_code == 403


def test_verifier_rejects_when_no_audiences_configured():
    with pytest.raises(HTTPException) as exc:
        google_id_token.verify_google_id_token("token", allowed_audiences=[])
    assert exc.value.status_code == 500
