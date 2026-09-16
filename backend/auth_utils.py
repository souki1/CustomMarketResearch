from datetime import datetime, timezone, timedelta
from typing import Any
import secrets

from jose import JWTError, jwt
from passlib.context import CryptContext

from config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

DEFAULT_ACCESS_MINUTES = 480  # 8 hours


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _encode(payload: dict[str, Any]) -> str:
    algo = settings.algorithm or "HS256"
    return jwt.encode(payload, settings.secret_key, algorithm=algo)


def _base_claims(sub: str | int, token_type: str, expire: datetime, extra: dict[str, Any] | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sub": str(sub),
        "exp": expire,
        "typ": token_type,
        "jti": secrets.token_urlsafe(12),
    }
    if extra:
        payload.update(extra)
    return payload


def create_access_token(sub: str | int, extra: dict[str, Any] | None = None) -> str:
    minutes = settings.access_token_expire_minutes or DEFAULT_ACCESS_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return _encode(_base_claims(sub, "access", expire, extra))


def create_refresh_token(sub: str | int, extra: dict[str, Any] | None = None) -> str:
    days = settings.refresh_token_expire_days or 7
    expire = datetime.now(timezone.utc) + timedelta(days=days)
    return _encode(_base_claims(sub, "refresh", expire, extra))


def create_mfa_token(sub: str | int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    return _encode(_base_claims(sub, "mfa", expire, None))


def decode_access_token(token: str) -> dict | None:
    try:
        algo = settings.algorithm or "HS256"
        return jwt.decode(token, settings.secret_key, algorithms=[algo])
    except JWTError:
        return None


def decode_token(token: str, expected_typ: str | None = None) -> dict | None:
    payload = decode_access_token(token)
    if not payload:
        return None
    if expected_typ and payload.get("typ") != expected_typ:
        return None
    return payload


def access_token_expires_in_seconds() -> int:
    minutes = settings.access_token_expire_minutes or DEFAULT_ACCESS_MINUTES
    return int(minutes) * 60
