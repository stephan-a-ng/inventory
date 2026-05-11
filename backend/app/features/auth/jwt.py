"""JWT signing helpers — kept separate from routes/dependencies to avoid intra-slice cycles."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, JWTError

from app.shared.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS


def create_jwt_token(user_id: str, email: str, role: str = "viewer") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None
