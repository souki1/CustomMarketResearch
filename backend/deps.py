from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import ACCESS_TOKEN_TYPE, decode_access_token
from crypto_secrets import hmac_sha256
from database import get_db
from models import ApiKey, AuthSession, User
from security import client_ip, client_user_agent

LAST_SEEN_TOUCH_SECONDS = 300


def _parse_bearer(request: Request) -> str:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


async def _user_from_api_key(db: AsyncSession, request: Request, raw_key: str) -> User:
    key_hash = hmac_sha256(raw_key)
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.revoked_at.is_(None))
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_result = await db.execute(select(User).where(User.id == api_key.user_id))
    user = user_result.scalar_one_or_none()
    if not user or user.is_active is False:
        raise HTTPException(status_code=401, detail="User not found")
    api_key.last_used_at = datetime.now(timezone.utc)
    request.state.auth_method = "api_key"
    request.state.api_key_id = api_key.id
    request.state.session_jti = None
    request.state.session_id = None
    return user


async def _user_from_jwt(db: AsyncSession, request: Request, token: str) -> User:
    payload = decode_access_token(token)
    if not payload or payload.get("typ") != ACCESS_TOKEN_TYPE or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    jti = payload.get("jti")
    if not jti:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token") from None

    session_result = await db.execute(select(AuthSession).where(AuthSession.jti == jti))
    session = session_result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not session or session.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Session expired")
    if session.expires_at < now:
        session.revoked_at = now
        raise HTTPException(status_code=401, detail="Session expired")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or user.id != session.user_id:
        raise HTTPException(status_code=401, detail="User not found")
    if user.is_active is False:
        raise HTTPException(status_code=401, detail="Account disabled")

    if session.last_seen_at is None or (now - session.last_seen_at).total_seconds() > LAST_SEEN_TOUCH_SECONDS:
        session.last_seen_at = now
        session.ip = client_ip(request)
        session.user_agent = client_user_agent(request)

    request.state.auth_method = "session"
    request.state.session_jti = jti
    request.state.session_id = session.id
    return user


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    token = _parse_bearer(request)
    if token.startswith("cmr_"):
        return await _user_from_api_key(db, request, token)
    return await _user_from_jwt(db, request, token)
