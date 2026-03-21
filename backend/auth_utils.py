from datetime import datetime, timezone, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(sub: str | int, extra: dict[str, Any] | None = None) -> str:
    minutes = settings.access_token_expire_minutes or 10080  # 7 days if not set in .env
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": str(sub), "exp": expire}
    if extra:
        payload.update(extra)
    algo = settings.algorithm or "HS256"
    return jwt.encode(payload, settings.secret_key, algorithm=algo)


def decode_access_token(token: str) -> dict | None:
    try:
        algo = settings.algorithm or "HS256"
        return jwt.decode(token, settings.secret_key, algorithms=[algo])
    except JWTError:
        return None
