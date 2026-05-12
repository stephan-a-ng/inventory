"""Authentication routes — Google OAuth with role-based access."""
import logging
import secrets

import httpx
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

from app.shared.config import (
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
    JWT_EXPIRATION_HOURS,
    FRONTEND_URL, IS_DEPLOYED, is_authorized_email,
    mobile_google_client_ids,
)
from app.shared.db import DatabasePool

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
            raise HTTPException(status_code=400, detail="Failed to exchange code")

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
