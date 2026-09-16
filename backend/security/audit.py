"""Append-only security audit trail (no secrets in detail)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from models import AuditLog
from security.rate_limit import client_ip


async def record_audit(
    db: AsyncSession,
    *,
    action: str,
    user_id: int | None = None,
    request=None,
    detail: str | None = None,
    trust_proxy: bool = False,
) -> None:
    ip = client_ip(request, trust_proxy=trust_proxy) if request is not None else None
    user_agent = None
    if request is not None:
        user_agent = (request.headers.get("user-agent") or "")[:512] or None
    db.add(
        AuditLog(
            user_id=user_id,
            action=action[:80],
            ip_address=ip,
            user_agent=user_agent,
            detail=(detail or "")[:1000] or None,
            created_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()
