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

# Frontend URL
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
