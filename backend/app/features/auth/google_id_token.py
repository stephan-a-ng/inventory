"""Verify a Google ID token (JWT) against Google's JWKS.

Used by the mobile-auth endpoint to accept a token minted by Google Sign-In
inside the installer-app Flutter client. The web flow uses an authorization-
code exchange and does not go through here.
"""
from __future__ import annotations

from fastapi import HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

_VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def verify_google_id_token(token: str, allowed_audiences: list[str]) -> dict:
    """Return the verified id_token claims. Raises 401 on any verification failure."""
    if not allowed_audiences:
        raise HTTPException(
            status_code=500,
            detail="Mobile Google client IDs not configured",
        )

    try:
        # verify_oauth2_token validates signature against Google JWKS, exp, iss, and aud.
        # We pass the first audience; we re-check aud below to accept either iOS or Android.
        claims = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=None,  # we validate aud manually below
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")

    if claims.get("iss") not in _VALID_ISSUERS:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")
    if claims.get("aud") not in allowed_audiences:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")
    if not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Invalid Google ID token")
    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")

    return claims
