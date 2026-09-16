from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import IssuedToken, create_access_token
from models import AuthSession, User
from security import client_ip, client_user_agent


async def create_user_session(db: AsyncSession, user: User, request: Request) -> IssuedToken:
    issued = create_access_token(user.id)
    now = datetime.now(timezone.utc)
    db.add(
        AuthSession(
            user_id=user.id,
            jti=issued.jti,
            created_at=now,
            last_seen_at=now,
            expires_at=issued.expires_at,
            ip=client_ip(request),
            user_agent=client_user_agent(request),
        )
    )
    user.last_login_at = now
    user.failed_login_count = 0
    user.locked_until = None
    return issued
