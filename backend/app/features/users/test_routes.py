"""Integration tests for the user-management slice."""
import pytest

pytestmark = pytest.mark.integration


async def test_list_users_admin(client, auth_user):
    admin, token = await auth_user("admin", email="admin@moonfive.tech")
    await auth_user("technician", email="tech@moonfive.tech")
    await auth_user("viewer", email="viewer@moonfive.tech")
    client.cookies.set("auth_token", token)

    r = await client.get("/api/users")
    assert r.status_code == 200
    body = r.json()
    emails = {u["email"] for u in body}
    assert {"admin@moonfive.tech", "tech@moonfive.tech", "viewer@moonfive.tech"} <= emails
    # All users have role + id fields.
    for u in body:
        assert u["role"] in {"admin", "technician", "installer", "viewer"}


async def test_list_users_non_admin_forbidden(client, auth_user):
    _, token = await auth_user("technician")
    client.cookies.set("auth_token", token)

    r = await client.get("/api/users")
    assert r.status_code == 403


async def test_list_users_unauthenticated(client):
    r = await client.get("/api/users")
    assert r.status_code == 401


async def test_update_role_happy_path(client, auth_user, integration_pool):
    _, admin_token = await auth_user("admin", email="admin@moonfive.tech")
    target, _ = await auth_user("viewer", email="viewer@partner.com")
    client.cookies.set("auth_token", admin_token)

    r = await client.patch(
        f"/api/users/{target['id']}/role",
        json={"role": "installer"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "installer"

    # Audit log row exists with no PoP-style leakage.
    async with integration_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT action, old_value, new_value FROM inventory.audit_log "
            "WHERE action = 'user_role_changed' ORDER BY created_at DESC LIMIT 1"
        )
    assert row is not None
    assert "viewer" in str(row["old_value"])
    assert "installer" in str(row["new_value"])


async def test_update_role_rejects_self_demotion(client, auth_user):
    admin, token = await auth_user("admin", email="admin@moonfive.tech")
    client.cookies.set("auth_token", token)

    r = await client.patch(
        f"/api/users/{admin['id']}/role",
        json={"role": "viewer"},
    )
    assert r.status_code == 400
    assert "own role" in r.json()["detail"].lower()


async def test_update_role_rejects_unknown_user(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    # A random UUID that doesn't exist.
    r = await client.patch(
        "/api/users/00000000-0000-0000-0000-000000000000/role",
        json={"role": "viewer"},
    )
    assert r.status_code == 404


async def test_update_role_rejects_invalid_role(client, auth_user):
    _, admin_token = await auth_user("admin", email="admin@moonfive.tech")
    target, _ = await auth_user("viewer", email="v@x.com")
    client.cookies.set("auth_token", admin_token)

    r = await client.patch(
        f"/api/users/{target['id']}/role",
        json={"role": "superuser"},
    )
    assert r.status_code == 400


async def test_update_role_non_admin_forbidden(client, auth_user):
    _, tech_token = await auth_user("technician", email="tech@moonfive.tech")
    target, _ = await auth_user("viewer", email="v@x.com")
    client.cookies.set("auth_token", tech_token)

    r = await client.patch(
        f"/api/users/{target['id']}/role",
        json={"role": "installer"},
    )
    assert r.status_code == 403


async def test_promote_to_installer_then_mobile_auth_succeeds(client, auth_user, monkeypatch):
    """End-to-end: admin promotes a viewer → mobile-google auth succeeds.

    Exercises the onboarding workflow for partner installers.
    """
    _, admin_token = await auth_user("admin", email="admin@moonfive.tech")
    target, _ = await auth_user("viewer", email="partner@external.com")

    client.cookies.set("auth_token", admin_token)
    r = await client.patch(
        f"/api/users/{target['id']}/role",
        json={"role": "installer"},
    )
    assert r.status_code == 200

    # Now simulate mobile sign-in.
    monkeypatch.setattr(
        "app.shared.config.MOBILE_GOOGLE_CLIENT_ID_IOS",
        "test-ios.apps.googleusercontent.com",
    )

    def fake_verify(token, allowed):
        return {
            "iss": "https://accounts.google.com",
            "aud": "test-ios.apps.googleusercontent.com",
            "email": "partner@external.com",
            "email_verified": True,
        }
    monkeypatch.setattr(
        "app.features.auth.routes.verify_google_id_token", fake_verify
    )

    client.cookies.clear()
    r = await client.post("/api/auth/mobile/google", json={"id_token": "fake"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "installer"
