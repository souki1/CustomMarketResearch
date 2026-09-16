"""Shared FastAPI auth dependencies. Import this instead of copying JWT decode logic."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_token
from database import get_db
from models import AuthSession, User


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:].strip()
    payload = decode_token(token, expected_typ="access")
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token") from None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")

    token_ver = payload.get("ver")
    if token_ver is not None and int(token_ver) != int(user.token_version or 0):
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")

    sid = payload.get("sid")
    if sid:
        session_result = await db.execute(
            select(AuthSession).where(AuthSession.sid == str(sid), AuthSession.user_id == user.id)
        )
        session = session_result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if not session or session.revoked_at is not None or session.expires_at < now:
            raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
        request.state.auth_sid = session.sid
        request.state.auth_session_id = session.id
    else:
        # Legacy tokens issued before session tracking: still honor token_version.
        request.state.auth_sid = None
        request.state.auth_session_id = None

    request.state.auth_user_id = user.id
    return user
