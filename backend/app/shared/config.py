"""Environment configuration for MoonFive Inventory"""
import os

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"
IS_DEPLOYED = ENVIRONMENT in ("production", "staging")

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/inventory")

# Google OAuth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")

# JWT
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key")
if IS_DEPLOYED and JWT_SECRET == "dev-secret-key":
    raise RuntimeError("JWT_SECRET must be set in deployed environments")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7

# Auth
AUTHORIZED_DOMAIN = os.getenv("AUTHORIZED_DOMAIN", "moonfive.tech")

def is_authorized_email(email: str) -> bool:
    return email.lower().endswith(f"@{AUTHORIZED_DOMAIN}")

# Dev-only login bypass. Enables `GET /api/auth/dev-login` which mints a
# JWT for a synthetic admin user — handy when running the local frontend
# against a backend that doesn't have a registered Google OAuth redirect
# URI. Refuses to enable in deployed environments.
DEV_LOGIN_ENABLED = (
    os.getenv("DEV_LOGIN_ENABLED", "").lower() in ("1", "true", "yes")
    and not IS_DEPLOYED
)
DEV_LOGIN_EMAIL = os.getenv("DEV_LOGIN_EMAIL", "dev@localhost")

# Frontend URL
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# PoP (proof-of-possession) for installer-app WiFi commissioning.
# Fernet key (32 url-safe base64 bytes). Generate via:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# The dev default is a fixed valid-Fernet key; staging/production fetch from
# Secret Manager via env (inventory-pop-encryption-key-<env>).
_POP_DEV_KEY = "ouu1aARMcEOxbR04uMSR_VlhXAhAqPSfzHR8iIeUknA="
POP_ENCRYPTION_KEY = os.getenv("POP_ENCRYPTION_KEY", _POP_DEV_KEY)
if IS_DEPLOYED and POP_ENCRYPTION_KEY == _POP_DEV_KEY:
    raise RuntimeError("POP_ENCRYPTION_KEY must be set in deployed environments")

# Mobile-app Google Sign-In OAuth client IDs (separate from the web client; per-platform).
# Stored in Secret Manager as inventory-mobile-google-client-id-{ios,android}-<env>.
MOBILE_GOOGLE_CLIENT_ID_IOS = os.getenv("MOBILE_GOOGLE_CLIENT_ID_IOS", "")
MOBILE_GOOGLE_CLIENT_ID_ANDROID = os.getenv("MOBILE_GOOGLE_CLIENT_ID_ANDROID", "")

def mobile_google_client_ids() -> list[str]:
    return [cid for cid in (MOBILE_GOOGLE_CLIENT_ID_IOS, MOBILE_GOOGLE_CLIENT_ID_ANDROID) if cid]

# Firmware-release version check. The DeviceDetail Firmware-stage card
# compares each device's firmware_version against the latest GitHub release
# tag for its product type. Cache prevents hitting GitHub's anonymous
# 60-req/hour rate limit. Optional token bumps the limit to 5000/hour.
FIRMWARE_RELEASE_CACHE_TTL_SECONDS = int(os.getenv("FIRMWARE_RELEASE_CACHE_TTL_SECONDS", "3600"))
GITHUB_API_TOKEN = os.getenv("GITHUB_API_TOKEN", "")
