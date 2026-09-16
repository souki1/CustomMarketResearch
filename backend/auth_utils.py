from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any

import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

ACCESS_TOKEN_TYPE = "access"
PENDING_2FA_TOKEN_TYPE = "2fa_pending"


@dataclass(frozen=True)
class IssuedToken:
    token: str
    jti: str
    expires_at: datetime
    token_type: str


def hash_password(password: str) -> str:
    # bcrypt truncates at 72 bytes; reject rather than silently shortening.
    encoded = password.encode("utf-8")
    if len(encoded) > 72:
        raise ValueError("Password is too long")
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _encode(payload: dict[str, Any]) -> str:
    algo = settings.algorithm or "HS256"
    return jwt.encode(payload, settings.secret_key, algorithm=algo)


def create_access_token(
    sub: str | int,
    extra: dict[str, Any] | None = None,
    *,
    minutes: int | None = None,
    token_type: str = ACCESS_TOKEN_TYPE,
) -> IssuedToken:
    ttl = minutes if minutes is not None else (settings.access_token_expire_minutes or 1440)
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ttl)
    jti = secrets.token_urlsafe(16)
    payload: dict[str, Any] = {
        "sub": str(sub),
        "exp": expire,
        "iat": now,
        "jti": jti,
        "typ": token_type,
    }
    if extra:
        payload.update(extra)
    return IssuedToken(token=_encode(payload), jti=jti, expires_at=expire, token_type=token_type)


def create_pending_2fa_token(sub: str | int) -> IssuedToken:
    return create_access_token(sub, minutes=5, token_type=PENDING_2FA_TOKEN_TYPE)


def decode_access_token(token: str) -> dict | None:
    try:
        algo = settings.algorithm or "HS256"
        return jwt.decode(token, settings.secret_key, algorithms=[algo])
    except JWTError:
        return None
