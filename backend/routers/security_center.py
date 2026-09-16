import secrets
from datetime import datetime, timezone
from typing import Annotated

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from audit import purge_user_mongo_data, record_audit
from auth_utils import verify_password
from crypto_secrets import encrypt_str, hmac_sha256
from database import get_db
from deps import get_current_user
from models import ApiKey, AuditEvent, AuthSession, CompanyProfile, NotificationSettings, OAuthExchangeCode, User
from mongo import get_mongo_db
from routers.auth import totp_qr_svg, verify_totp_code
from schemas import (
    AccountDeleteBody,
    ApiKeyCreateBody,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
    AuditEventResponse,
    SessionResponse,
    TotpDisableBody,
    TotpEnableBody,
    TotpSetupResponse,
)
from security import rate_limit_auth

router = APIRouter(prefix="/auth", tags=["security"])
TOTP_ISSUER = "Intelligent Research"


def _current_session_id(request: Request) -> int | None:
    return getattr(request.state, "session_id", None)


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if getattr(request.state, "auth_method", None) == "api_key":
        raise HTTPException(status_code=403, detail="API keys cannot manage browser sessions")
    result = await db.execute(
        select(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .order_by(AuthSession.created_at.desc())
    )
    current_id = _current_session_id(request)
    now = datetime.now(timezone.utc)
    sessions: list[SessionResponse] = []
    for row in result.scalars().all():
        if row.expires_at < now:
            continue
        sessions.append(
            SessionResponse(
                id=row.id,
                created_at=row.created_at,
                last_seen_at=row.last_seen_at,
                expires_at=row.expires_at,
                ip=row.ip,
                user_agent=row.user_agent,
                is_current=row.id == current_id,
            )
        )
    return sessions


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(
        select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        user_id=user.id,
        action="session_revoke",
        request=request,
        detail=f"session_id={session.id}",
    )
    return {"detail": "Session revoked"}


@router.post("/logout")
async def logout(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    session_id = _current_session_id(request)
    if session_id is not None:
        result = await db.execute(
            select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user.id)
        )
        session = result.scalar_one_or_none()
        if session and session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
    await record_audit(db, user_id=user.id, action="logout", request=request)
    return {"detail": "Signed out"}


@router.post("/logout-all")
async def logout_all(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    now = datetime.now(timezone.utc)
    current_id = _current_session_id(request)
    result = await db.execute(
        select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
    )
    count = 0
    for session in result.scalars().all():
        if session.id == current_id:
            continue
        session.revoked_at = now
        count += 1
    await record_audit(
        db,
        user_id=user.id,
        action="logout_all",
        request=request,
        detail=f"revoked={count}",
    )
    return {"detail": "Other sessions revoked", "revoked": count}


@router.post("/2fa/setup", response_model=TotpSetupResponse)
async def setup_2fa(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await rate_limit_auth(request, "totp_setup", limit=8, window_seconds=900)
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is already enabled")
    secret = pyotp.random_base32()
    user.totp_secret = encrypt_str(secret)
    user.totp_enabled = False
    otpauth_url = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=TOTP_ISSUER)
    await record_audit(db, user_id=user.id, action="2fa_setup", request=request)
    return TotpSetupResponse(otpauth_url=otpauth_url, qr_svg=totp_qr_svg(otpauth_url), secret=secret)


@router.post("/2fa/enable")
async def enable_2fa(
    body: TotpEnableBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is already enabled")
    if not user.totp_secret or not verify_totp_code(user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    user.totp_enabled = True
    await record_audit(db, user_id=user.id, action="2fa_enable", request=request)
    return {"detail": "Two-factor authentication enabled"}


@router.post("/2fa/disable")
async def disable_2fa(
    body: TotpDisableBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if not user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is not enabled")
    if user.password_hash:
        if not body.password or not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Password is incorrect")
    if not user.totp_secret or not verify_totp_code(user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    user.totp_enabled = False
    user.totp_secret = None
    await record_audit(db, user_id=user.id, action="2fa_disable", request=request)
    return {"detail": "Two-factor authentication disabled"}


@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
        .order_by(ApiKey.created_at.desc())
    )
    return [
        ApiKeyResponse(
            id=row.id,
            name=row.name,
            prefix=row.prefix,
            created_at=row.created_at,
            last_used_at=row.last_used_at,
        )
        for row in result.scalars().all()
    ]


@router.post("/api-keys", response_model=ApiKeyCreatedResponse)
async def create_api_key(
    body: ApiKeyCreateBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await rate_limit_auth(request, "api_key_create", limit=8, window_seconds=3600)
    existing = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
    )
    if len(list(existing.scalars().all())) >= 10:
        raise HTTPException(status_code=400, detail="You can have at most 10 active API keys")
    raw = "cmr_" + secrets.token_urlsafe(32)
    prefix = raw[:12]
    row = ApiKey(
        user_id=user.id,
        name=body.name.strip(),
        prefix=prefix,
        key_hash=hmac_sha256(raw),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    await record_audit(db, user_id=user.id, action="api_key_create", request=request, detail=prefix)
    return ApiKeyCreatedResponse(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        key=raw,
        created_at=row.created_at,
    )


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
    await record_audit(db, user_id=user.id, action="api_key_revoke", request=request, detail=row.prefix)
    return {"detail": "API key revoked"}


@router.get("/audit", response_model=list[AuditEventResponse])
async def list_audit_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.user_id == user.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(50)
    )
    return [
        AuditEventResponse(
            id=row.id,
            action=row.action,
            ip=row.ip,
            detail=row.detail,
            created_at=row.created_at,
        )
        for row in result.scalars().all()
    ]


@router.post("/account/delete")
async def delete_account(
    body: AccountDeleteBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await rate_limit_auth(request, "account_delete", limit=3, window_seconds=3600)
    if user.password_hash:
        if not body.password:
            raise HTTPException(status_code=400, detail="Password is required")
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Password is incorrect")
    user_id = user.id
    await record_audit(db, user_id=user_id, action="account_delete", request=request)
    try:
        mongo_db = get_mongo_db()
    except RuntimeError:
        mongo_db = None
    await purge_user_mongo_data(mongo_db, user_id)

    await db.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
    await db.execute(delete(ApiKey).where(ApiKey.user_id == user_id))
    await db.execute(delete(CompanyProfile).where(CompanyProfile.user_id == user_id))
    await db.execute(delete(NotificationSettings).where(NotificationSettings.user_id == user_id))
    await db.execute(delete(OAuthExchangeCode).where(OAuthExchangeCode.user_id == user_id))
    await db.delete(user)
    return {"detail": "Account deleted"}
