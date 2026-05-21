"""Authentication routes — Google OAuth with role-based access."""
import json
import logging
import secrets
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel, Field

from app.shared.config import (
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
    JWT_EXPIRATION_HOURS,
    FRONTEND_URL, IS_DEPLOYED, is_authorized_email,
    mobile_google_client_ids,
)
from app.shared.db import DatabasePool

from .api_key_service import (
    consume_pending_exchange,
    list_user_keys,
    mint_api_key,
    revoke_key,
    stash_pending_exchange,
)
from .dependencies import get_current_user
from .google_id_token import verify_google_id_token
from .jwt import create_jwt_token, verify_jwt_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    state = secrets.token_urlsafe(32)
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        "response_type=code&"
        "scope=openid%20email%20profile&"
        "access_type=offline&"
        "prompt=select_account&"
        f"state={state}"
    )
    response = RedirectResponse(url=auth_url)
    response.set_cookie(
        key="oauth_state", value=state, httponly=True,
        secure=IS_DEPLOYED, samesite="lax", max_age=600,
    )
    return response


@router.get("/google/callback")
async def google_callback(request: Request, code: str = None, state: str = "", error: str = None):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    expected_state = request.cookies.get("oauth_state")
    if not expected_state or not state or state != expected_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": GOOGLE_REDIRECT_URI,
            },
        )
        if token_response.status_code != 200:
            logger.error("Google token exchange failed: %s %s", token_response.status_code, token_response.text)
            raise HTTPException(status_code=400, detail=f"Failed to exchange code: {token_response.text}")

        tokens = token_response.json()
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")

        user_info = userinfo_response.json()

    email = user_info.get("email")
    name = user_info.get("name")
    picture = user_info.get("picture", "")

    # Determine role: @moonfive.tech = admin, others = viewer
    role = "admin" if is_authorized_email(email) else "viewer"

    # Upsert user
    user = await DatabasePool.fetchrow(
        """INSERT INTO users (email, name, picture, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET name = $2, picture = $3, updated_at = now()
           RETURNING id, role""",
        email, name, picture, role,
    )

    # ------------------------------------------------------------------
    # CLI flow branch: if this OAuth round-trip was started by
    # /api/auth/cli-login, the cli_flow cookie carries {port, state}.
    # Mint an API key for the signed-in user (if @moonfive.tech),
    # stash plaintext keyed by state, and redirect to the local CLI
    # listener so it can exchange the state for the plaintext.
    # ------------------------------------------------------------------
    cli_cookie = request.cookies.get("cli_flow")
    if cli_cookie:
        try:
            cli_info = json.loads(cli_cookie)
            cli_port = int(cli_info["port"])
            cli_state = str(cli_info["state"])
        except (ValueError, KeyError, TypeError):
            cli_port, cli_state = None, None

        if cli_port and cli_state:
            if not is_authorized_email(email):
                # Out-of-org user. Don't mint a key; redirect to localhost
                # with an error indicator so the CLI can show a clear message.
                redirect = (
                    f"http://localhost:{cli_port}/?"
                    f"error=unauthorized_domain&email={email}"
                )
                resp = RedirectResponse(url=redirect)
                resp.delete_cookie(key="oauth_state")
                resp.delete_cookie(key="cli_flow")
                return resp

            # Mint a key tied to this user. `name` doubles as audit text.
            key_name = f"flash_provision — {email}"
            plaintext, _row = await mint_api_key(user_id=user["id"], name=key_name)
            stash_pending_exchange(cli_state, plaintext, key_name)

            redirect = f"http://localhost:{cli_port}/?state={cli_state}&email={email}"
            resp = RedirectResponse(url=redirect)
            resp.delete_cookie(key="oauth_state")
            resp.delete_cookie(key="cli_flow")
            return resp

    # Standard browser flow: cookie + redirect to web frontend.
    token = create_jwt_token(str(user["id"]), email, role=user["role"])
    response = RedirectResponse(url=FRONTEND_URL)
    response.set_cookie(
        key="auth_token", value=token, httponly=True,
        secure=IS_DEPLOYED,
        samesite="none" if IS_DEPLOYED else "lax",
        max_age=JWT_EXPIRATION_HOURS * 3600,
    )
    response.delete_cookie(key="oauth_state")
    return response


@router.get("/me")
async def get_me(request: Request):
    token = request.cookies.get("auth_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await DatabasePool.fetchrow(
        "SELECT id, email, name, picture, role FROM users WHERE id = $1",
        payload["sub"],
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "picture": user["picture"],
        "role": user["role"],
    }


@router.post("/logout")
async def logout():
    response = JSONResponse(content={"status": "logged_out"})
    response.delete_cookie(
        key="auth_token",
        secure=IS_DEPLOYED,
        samesite="none" if IS_DEPLOYED else "lax",
    )
    return response


class MobileGoogleAuthRequest(BaseModel):
    id_token: str


@router.post("/mobile/google")
async def mobile_google_auth(body: MobileGoogleAuthRequest):
    """Exchange a Google ID token (from the Flutter installer app) for a MoonFive bearer JWT.

    Differs from the web flow: no cookie, no domain auto-allowlist. The user must
    already exist in `users` with a non-viewer role; new accounts are promoted
    out-of-band by an admin in the web Settings page.
    """
    if not body.id_token:
        raise HTTPException(status_code=400, detail="id_token required")

    claims = verify_google_id_token(body.id_token, mobile_google_client_ids())
    email = claims["email"].lower()

    user = await DatabasePool.fetchrow(
        "SELECT id, email, name, picture, role FROM users WHERE lower(email) = $1",
        email,
    )
    if not user or user["role"] == "viewer":
        raise HTTPException(status_code=403, detail="Account not authorized")

    access_token = create_jwt_token(str(user["id"]), user["email"], role=user["role"])
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": JWT_EXPIRATION_HOURS * 3600,
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
    }


# ============================================================================
# CLI OAuth flow (for headless tools like argo's flash_provision.py)
# ============================================================================
#
# Flow:
#   1. CLI picks a free localhost port + random state.
#   2. CLI opens browser to GET /api/auth/cli-login?port=PORT&state=STATE.
#   3. This route sets a `cli_flow` cookie carrying {port, state}, then
#      hands off to the same Google OAuth as the web flow.
#   4. Google callback (above) sees the cli_flow cookie, mints an API
#      key for the signed-in user, stashes plaintext keyed by state,
#      and 302s the browser to http://localhost:PORT/?state=STATE.
#   5. CLI's localhost listener captures `state` and POSTs to
#      /api/auth/cli-exchange. That endpoint hands back the plaintext
#      key (single-use, 5-minute TTL).


class CliExchangeRequest(BaseModel):
    state: str = Field(..., min_length=8, max_length=128)


@router.get("/cli-login")
async def cli_login(port: int, state: str):
    """First leg of the CLI OAuth flow. Sets the cli_flow cookie carrying
    {port, state}, then redirects to Google with the standard oauth_state."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    if not (1024 <= port <= 65535):
        raise HTTPException(status_code=400, detail="port must be 1024..65535")
    if len(state) < 8:
        raise HTTPException(status_code=400, detail="state must be >= 8 chars")

    oauth_state = secrets.token_urlsafe(32)
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        "response_type=code&"
        "scope=openid%20email%20profile&"
        "access_type=offline&"
        "prompt=select_account&"
        f"state={oauth_state}"
    )
    response = RedirectResponse(url=auth_url)
    response.set_cookie(
        key="oauth_state", value=oauth_state, httponly=True,
        secure=IS_DEPLOYED, samesite="lax", max_age=600,
    )
    response.set_cookie(
        key="cli_flow",
        value=json.dumps({"port": port, "state": state}),
        httponly=True, secure=IS_DEPLOYED, samesite="lax", max_age=600,
    )
    return response


@router.post("/cli-exchange")
async def cli_exchange(body: CliExchangeRequest):
    """Second leg: the CLI POSTs the state it received via localhost
    redirect; we hand back the plaintext API key. Single-use; the
    in-memory entry is consumed regardless of the success path."""
    entry = consume_pending_exchange(body.state)
    if entry is None:
        raise HTTPException(status_code=404, detail="Unknown or expired state")
    return {"api_key": entry.api_key_plaintext, "name": entry.name}


# ============================================================================
# API key management (browser-authenticated)
# ============================================================================


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


@router.get("/api-keys")
async def list_api_keys(user: dict = Depends(get_current_user)):
    """List the calling user's API keys (no plaintext, ever)."""
    keys = await list_user_keys(UUID(str(user["id"])))
    return {
        "keys": [
            {
                "id": str(k["id"]),
                "name": k["name"],
                "key_prefix": k["key_prefix"],
                "created_at": k["created_at"].isoformat() if k.get("created_at") else None,
                "last_used_at": (
                    k["last_used_at"].isoformat() if k.get("last_used_at") else None
                ),
                "revoked_at": (
                    k["revoked_at"].isoformat() if k.get("revoked_at") else None
                ),
            }
            for k in keys
        ]
    }


@router.post("/api-keys", status_code=201)
async def create_api_key(body: CreateApiKeyRequest, user: dict = Depends(get_current_user)):
    """Manually mint a new key from the web UI. Plaintext returned once."""
    plaintext, row = await mint_api_key(user_id=UUID(str(user["id"])), name=body.name)
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "key_prefix": row["key_prefix"],
        "api_key": plaintext,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


@router.delete("/api-keys/{key_id}", status_code=204)
async def delete_api_key(key_id: UUID, user: dict = Depends(get_current_user)):
    ok = await revoke_key(user_id=UUID(str(user["id"])), key_id=key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Key not found or already revoked")
    return JSONResponse(status_code=204, content=None)
