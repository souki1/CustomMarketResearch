import base64
import io
import json
import secrets
import smtplib
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from urllib.parse import urlencode

import pyotp
import qrcode
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import (
    access_token_expires_in_seconds,
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from config import get_settings
from database import get_db
from models import AuthExchangeCode, AuthSession, User
from schemas import (
    DeleteAccountBody,
    GoogleExchangeBody,
    LogoutBody,
    MessageResponse,
    MfaBackupCodesResponse,
    MfaConfirmBody,
    MfaDisableBody,
    MfaSetupResponse,
    MfaSignInBody,
    PasswordChangeConfirmBody,
    PasswordChangeConfirmResponse,
    PasswordChangeRequestBody,
    PasswordChangeRequestResponse,
    RefreshTokenBody,
    SessionResponse,
    SignInBody,
    SignUpBody,
    TokenResponse,
    UpdateProfileBody,
    UserResponse,
)
from security.audit import record_audit
from security.crypto import decrypt_secret, digest_equals, encrypt_secret, hash_token
from security.deps import get_current_user
from security.files import ALLOWED_PHOTO_EXTENSIONS, extension_of, sniff_image_type
from security.password_policy import validate_password
from security.rate_limit import client_ip, enforce_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_ATTEMPTS = 5
OAUTH_CODE_TTL_SECONDS = 60
BACKUP_CODE_COUNT = 8
# Constant bcrypt hash so missing-user sign-in takes the same time as a real verify.
_DUMMY_PASSWORD_HASH = hash_password("invalid-password-placeholder-0")


def _hash_otp(user_id: int, code: str) -> str:
    return hash_token(f"{settings.secret_key}:{user_id}:{code}")


def _send_email_code(to_email: str, code: str) -> str:
    """
    Send a verification code via SMTP if configured.
    Returns delivery string: 'smtp' or 'console'.
    """
    if not settings.smtp_host or not settings.smtp_from:
        print(f"[DEV] Password change code for {to_email}: {code}")  # noqa: T201
        return "console"

    msg_subject = "Your verification code"
    from email.message import EmailMessage

    msg = EmailMessage()
    msg["Subject"] = msg_subject
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg.set_content(f"Your verification code is: {code}\n\nThis code expires in {OTP_TTL_MINUTES} minutes.")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
        if settings.smtp_use_tls:
            s.starttls()
        if settings.smtp_username and settings.smtp_password:
            s.login(settings.smtp_username, settings.smtp_password)
        s.send_message(msg)
    return "smtp"


def _display_name_from_email(email: str) -> str:
    local = email.split("@")[0] or "User"
    cleaned = " ".join(word.capitalize() for word in local.replace(".", " ").replace("_", " ").split())
    return cleaned or "User"


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        phone=user.phone,
        job_title=user.job_title,
        profile_photo_url=user.profile_photo_url,
        totp_enabled=bool(user.totp_enabled),
        last_login_at=user.last_login_at,
    )


def _rate_limit_auth(request: Request, scope: str) -> None:
    ip = client_ip(request, trust_proxy=settings.trust_proxy)
    enforce_rate_limit(f"auth:{scope}:{ip}", settings.auth_rate_limit_per_minute, 60)


def _account_locked(user: User, now: datetime) -> bool:
    if user.locked_until is None:
        return False
    locked_until = user.locked_until
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return locked_until > now


async def _register_failed_login(db: AsyncSession, user: User, request: Request) -> None:
    now = datetime.now(timezone.utc)
    user.failed_login_attempts = int(user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= settings.max_login_attempts:
        user.locked_until = now + timedelta(minutes=settings.lockout_minutes)
        user.failed_login_attempts = 0
        await record_audit(
            db,
            action="login_lockout",
            user_id=user.id,
            request=request,
            trust_proxy=settings.trust_proxy,
        )
    await db.flush()


async def _clear_lockout(user: User) -> None:
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)


async def _revoke_all_sessions(db: AsyncSession, user_id: int) -> None:
    now = datetime.now(timezone.utc)
    result = await db.execute(select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)))
    for session in result.scalars().all():
        session.revoked_at = now
    await db.flush()


async def _issue_tokens(
    db: AsyncSession,
    user: User,
    request: Request,
    *,
    audit_action: str,
) -> TokenResponse:
    sid = secrets.token_urlsafe(24)
    extra = {"sid": sid, "ver": int(user.token_version or 0)}
    access = create_access_token(user.id, extra=extra)
    refresh = create_refresh_token(user.id, extra=extra)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=settings.refresh_token_expire_days or 7)
    db.add(
        AuthSession(
            sid=sid,
            user_id=user.id,
            refresh_token_hash=hash_token(refresh),
            created_at=now,
            last_seen_at=now,
            expires_at=expires_at,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
            ip_address=client_ip(request, trust_proxy=settings.trust_proxy),
        )
    )
    await record_audit(
        db,
        action=audit_action,
        user_id=user.id,
        request=request,
        trust_proxy=settings.trust_proxy,
    )
    await db.flush()
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        display_name=user.display_name,
        expires_in=access_token_expires_in_seconds(),
    )


def _backup_code_hashes(codes: list[str]) -> str:
    return json.dumps([hash_token(c) for c in codes])


def _generate_backup_codes() -> list[str]:
    return [secrets.token_hex(5) for _ in range(BACKUP_CODE_COUNT)]


def _consume_backup_code(user: User, code: str) -> bool:
    raw = (user.totp_backup_hashes or "").strip()
    if not raw:
        return False
    try:
        hashes: list[str] = json.loads(raw)
    except json.JSONDecodeError:
        return False
    digest = hash_token(code.strip().lower())
    remaining: list[str] = []
    matched = False
    for item in hashes:
        if not matched and digest_equals(item, digest):
            matched = True
            continue
        remaining.append(item)
    if matched:
        user.totp_backup_hashes = json.dumps(remaining)
    return matched


def _verify_totp(user: User, code: str) -> bool:
    cleaned = (code or "").strip().replace(" ", "")
    secret = decrypt_secret(user.totp_secret or "")
    if secret and pyotp.TOTP(secret).verify(cleaned, valid_window=1):
        return True
    return _consume_backup_code(user, cleaned.lower())


def _qr_data_uri(otpauth_url: str) -> str:
    img = qrcode.make(otpauth_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    client_kwargs={"scope": "openid email profile"},
)


@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignUpBody, request: Request, db: AsyncSession = Depends(get_db)):
    _rate_limit_auth(request, "signup")
    email = str(body.email).strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    display_name = body.display_name or _display_name_from_email(email)
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        display_name=display_name,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return await _issue_tokens(db, user, request, audit_action="signup")


@router.post("/signin", response_model=TokenResponse)
async def signin(body: SignInBody, request: Request, db: AsyncSession = Depends(get_db)):
    _rate_limit_auth(request, "signin")
    email = str(body.email).strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not user or not user.password_hash:
        verify_password(body.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")
    if _account_locked(user, now):
        raise HTTPException(status_code=423, detail="Account temporarily locked after too many failed sign-in attempts")
    if not verify_password(body.password, user.password_hash):
        await _register_failed_login(db, user, request)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.totp_enabled:
        await record_audit(
            db,
            action="login_mfa_challenge",
            user_id=user.id,
            request=request,
            trust_proxy=settings.trust_proxy,
        )
        return TokenResponse(
            access_token="",
            display_name=user.display_name,
            mfa_required=True,
            mfa_token=create_mfa_token(user.id),
        )
    await _clear_lockout(user)
    await db.flush()
    return await _issue_tokens(db, user, request, audit_action="login")


@router.post("/signin/mfa", response_model=TokenResponse)
async def signin_mfa(body: MfaSignInBody, request: Request, db: AsyncSession = Depends(get_db)):
    _rate_limit_auth(request, "signin-mfa")
    payload = decode_token(body.mfa_token, expected_typ="mfa")
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired verification token")
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.totp_enabled or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or expired verification token")
    if not _verify_totp(user, body.code):
        await _register_failed_login(db, user, request)
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    await _clear_lockout(user)
    await db.flush()
    return await _issue_tokens(db, user, request, audit_action="login_mfa")


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(body: RefreshTokenBody, request: Request, db: AsyncSession = Depends(get_db)):
    _rate_limit_auth(request, "refresh")
    payload = decode_token(body.refresh_token, expected_typ="refresh")
    if not payload or "sub" not in payload or not payload.get("sid"):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("ver") is not None and int(payload["ver"]) != int(user.token_version or 0):
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    session_result = await db.execute(
        select(AuthSession).where(AuthSession.sid == str(payload["sid"]), AuthSession.user_id == user.id)
    )
    session = session_result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if (
        not session
        or session.revoked_at is not None
        or session.expires_at < now
        or not digest_equals(session.refresh_token_hash, hash_token(body.refresh_token))
    ):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    new_refresh = create_refresh_token(user.id, extra={"sid": session.sid, "ver": int(user.token_version or 0)})
    new_access = create_access_token(user.id, extra={"sid": session.sid, "ver": int(user.token_version or 0)})
    session.refresh_token_hash = hash_token(new_refresh)
    session.last_seen_at = now
    session.ip_address = client_ip(request, trust_proxy=settings.trust_proxy)
    await db.flush()
    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        display_name=user.display_name,
        expires_in=access_token_expires_in_seconds(),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    body: LogoutBody | None = None,
):
    now = datetime.now(timezone.utc)
    sid = getattr(request.state, "auth_sid", None)
    if sid:
        result = await db.execute(select(AuthSession).where(AuthSession.sid == sid, AuthSession.user_id == user.id))
        session = result.scalar_one_or_none()
        if session and session.revoked_at is None:
            session.revoked_at = now
    if body and body.refresh_token:
        payload = decode_token(body.refresh_token, expected_typ="refresh")
        if payload and payload.get("sid"):
            result = await db.execute(
                select(AuthSession).where(AuthSession.sid == str(payload["sid"]), AuthSession.user_id == user.id)
            )
            session = result.scalar_one_or_none()
            if session and session.revoked_at is None:
                session.revoked_at = now
    await record_audit(db, action="logout", user_id=user.id, request=request, trust_proxy=settings.trust_proxy)
    await db.flush()
    return MessageResponse(detail="Signed out")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    current_sid = getattr(request.state, "auth_sid", None)
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
    )
    for session in result.scalars().all():
        if current_sid and session.sid == current_sid:
            continue
        session.revoked_at = now
    await record_audit(db, action="logout_all", user_id=user.id, request=request, trust_proxy=settings.trust_proxy)
    await db.flush()
    return MessageResponse(detail="Other sessions revoked")


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    current_sid = getattr(request.state, "auth_sid", None)
    result = await db.execute(
        select(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .order_by(AuthSession.last_seen_at.desc())
    )
    sessions = result.scalars().all()
    now = datetime.now(timezone.utc)
    out: list[SessionResponse] = []
    for session in sessions:
        if session.expires_at < now:
            continue
        out.append(
            SessionResponse(
                id=session.id,
                current=bool(current_sid and session.sid == current_sid),
                created_at=session.created_at,
                last_seen_at=session.last_seen_at,
                expires_at=session.expires_at,
                ip_address=session.ip_address,
                user_agent=session.user_agent,
            )
        )
    return out


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def revoke_session(
    session_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        action="session_revoke",
        user_id=user.id,
        request=request,
        detail=str(session_id),
        trust_proxy=settings.trust_proxy,
    )
    await db.flush()
    return MessageResponse(detail="Session revoked")


@router.get("/google")
async def google_login(request: Request):
    _rate_limit_auth(request, "google")
    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    frontend = (settings.frontend_url or "").rstrip("/")
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        return RedirectResponse(frontend + "/signin?error=google_denied")
    userinfo = token.get("userinfo") or {}
    email = (userinfo.get("email") or "").strip().lower()
    google_id = userinfo.get("sub")
    name = userinfo.get("name") or email.split("@")[0] or "User"
    if not email or not google_id:
        return RedirectResponse(frontend + "/signin?error=missing_email")
    if userinfo.get("email_verified") is False:
        return RedirectResponse(frontend + "/signin?error=unverified_email")
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()
    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.google_id = google_id
            if not user.display_name or user.display_name == _display_name_from_email(user.email):
                user.display_name = name
        else:
            user = User(
                email=email,
                password_hash=None,
                display_name=name,
                google_id=google_id,
                is_active=True,
            )
            db.add(user)
    if user and not user.is_active:
        return RedirectResponse(frontend + "/signin?error=account_disabled")
    await db.flush()
    await db.refresh(user)
    code = secrets.token_urlsafe(32)
    db.add(
        AuthExchangeCode(
            code_hash=hash_token(code),
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=OAUTH_CODE_TTL_SECONDS),
        )
    )
    await record_audit(
        db, action="login_google", user_id=user.id, request=request, trust_proxy=settings.trust_proxy
    )
    await db.flush()
    params = urlencode({"code": code})
    return RedirectResponse(frontend + "/auth/callback?" + params)


@router.post("/google/exchange", response_model=TokenResponse)
async def google_exchange(body: GoogleExchangeBody, request: Request, db: AsyncSession = Depends(get_db)):
    _rate_limit_auth(request, "google-exchange")
    now = datetime.now(timezone.utc)
    result = await db.execute(select(AuthExchangeCode).where(AuthExchangeCode.code_hash == hash_token(body.code)))
    row = result.scalar_one_or_none()
    if not row or row.used_at is not None or row.expires_at < now:
        raise HTTPException(status_code=401, detail="Invalid or expired sign-in code")
    row.used_at = now
    user_result = await db.execute(select(User).where(User.id == row.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or expired sign-in code")
    await db.flush()
    return await _issue_tokens(db, user, request, audit_action="login_google_exchange")


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return _user_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateProfileBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or user.display_name
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    if body.job_title is not None:
        user.job_title = body.job_title.strip() or None
    await db.flush()
    await db.refresh(user)
    return _user_response(user)


@router.delete("/me", response_model=MessageResponse)
async def delete_me(
    body: DeleteAccountBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    _rate_limit_auth(request, "delete-account")
    if str(body.email).strip().lower() != user.email.lower():
        raise HTTPException(status_code=400, detail="Email confirmation does not match")
    if user.password_hash:
        if not body.password or not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Password is required to delete this account")
    if user.totp_enabled:
        if not body.totp_code or not _verify_totp(user, body.totp_code):
            raise HTTPException(status_code=401, detail="Authenticator code is required to delete this account")
    user.is_active = False
    user.email = f"deleted+{user.id}-{secrets.token_hex(6)}@invalid.local"
    user.password_hash = None
    user.google_id = None
    user.profile_photo_data = None
    user.profile_photo_url = None
    user.totp_secret = None
    user.totp_pending_secret = None
    user.totp_enabled = False
    user.totp_backup_hashes = None
    user.token_version = int(user.token_version or 0) + 1
    await _revoke_all_sessions(db, user.id)
    await record_audit(db, action="account_delete", user_id=user.id, request=request, trust_proxy=settings.trust_proxy)
    await db.flush()
    return MessageResponse(detail="Account deleted")


@router.post("/me/photo", response_model=UserResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    ext = extension_of(file.filename)
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Allowed formats: " + ", ".join(sorted(ALLOWED_PHOTO_EXTENSIONS)),
        )
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    sniffed = sniff_image_type(content)
    if not sniffed:
        raise HTTPException(status_code=400, detail="File is not a valid image")
    user.profile_photo_content_type = sniffed
    user.profile_photo_data = content
    safe_name = f"{user.id}_{int(time.time() * 1000)}{ext}"
    user.profile_photo_url = f"/auth/profile-photo/{safe_name}"
    await db.flush()
    await db.refresh(user)
    return _user_response(user)


@router.get("/profile-photo/{filename}")
async def get_profile_photo(
    filename: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    url_path = f"/auth/profile-photo/{filename}"
    if user.profile_photo_url != url_path or not user.profile_photo_data:
        raise HTTPException(status_code=404, detail="Not found")

    media_type = user.profile_photo_content_type or "image/png"
    if media_type not in {"image/jpeg", "image/png", "image/gif", "image/webp"}:
        media_type = "application/octet-stream"
    return Response(
        content=user.profile_photo_data,
        media_type=media_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": "inline",
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'none'",
        },
    )


@router.post("/mfa/setup", response_model=MfaSetupResponse)
async def mfa_setup(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is already enabled")
    secret = pyotp.random_base32()
    user.totp_pending_secret = encrypt_secret(secret)
    await db.flush()
    otpauth_url = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Intelligent Research")
    return MfaSetupResponse(otpauth_url=otpauth_url, qr_data_uri=_qr_data_uri(otpauth_url), secret=secret)


@router.post("/mfa/confirm", response_model=MfaBackupCodesResponse)
async def mfa_confirm(
    body: MfaConfirmBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    pending = decrypt_secret(user.totp_pending_secret or "")
    if not pending:
        raise HTTPException(status_code=400, detail="Start two-factor setup first")
    if not pyotp.TOTP(pending).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    backup_codes = _generate_backup_codes()
    user.totp_secret = encrypt_secret(pending)
    user.totp_pending_secret = None
    user.totp_enabled = True
    user.totp_backup_hashes = _backup_code_hashes(backup_codes)
    await record_audit(db, action="mfa_enable", user_id=user.id, request=request, trust_proxy=settings.trust_proxy)
    await db.flush()
    return MfaBackupCodesResponse(
        backup_codes=backup_codes,
        detail="Two-factor authentication enabled. Store these backup codes in a safe place.",
    )


@router.post("/mfa/disable", response_model=MessageResponse)
async def mfa_disable(
    body: MfaDisableBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if not user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is not enabled")
    if not _verify_totp(user, body.code):
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    user.totp_enabled = False
    user.totp_secret = None
    user.totp_pending_secret = None
    user.totp_backup_hashes = None
    await record_audit(db, action="mfa_disable", user_id=user.id, request=request, trust_proxy=settings.trust_proxy)
    await db.flush()
    return MessageResponse(detail="Two-factor authentication disabled")


@router.post("/change-password/request", response_model=PasswordChangeRequestResponse)
async def request_password_change(
    body: PasswordChangeRequestBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    _rate_limit_auth(request, "password-change")
    if body.channel == "sms":
        raise HTTPException(status_code=400, detail="SMS delivery is not configured yet. Use email.")

    now = datetime.now(timezone.utc)
    if user.password_change_code_last_sent_at is not None:
        last_sent = user.password_change_code_last_sent_at
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        delta = (now - last_sent).total_seconds()
        if delta < OTP_RESEND_COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail="Please wait before requesting another code")

    code = f"{secrets.randbelow(1_000_000):06d}"
    user.password_change_code_hash = _hash_otp(user.id, code)
    user.password_change_code_expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    user.password_change_code_last_sent_at = now
    user.password_change_code_attempts = 0
    await db.flush()

    delivery = _send_email_code(user.email, code)
    resp = PasswordChangeRequestResponse(detail="Verification code sent", delivery=delivery)
    if settings.dev_return_otp and not settings.is_production:
        resp.dev_code = code
    return resp


@router.post("/change-password/confirm", response_model=PasswordChangeConfirmResponse)
async def confirm_password_change(
    body: PasswordChangeConfirmBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")
    policy_err = validate_password(body.new_password, user.email)
    if policy_err:
        raise HTTPException(status_code=400, detail=policy_err)

    now = datetime.now(timezone.utc)
    if not user.password_change_code_hash or not user.password_change_code_expires_at:
        raise HTTPException(status_code=400, detail="No active verification code. Request a new code.")
    expires_at = user.password_change_code_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=400, detail="Code expired. Request a new code.")
    if user.password_change_code_attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")

    if not digest_equals(user.password_change_code_hash, _hash_otp(user.id, code)):
        user.password_change_code_attempts += 1
        await db.flush()
        raise HTTPException(status_code=400, detail="Invalid code")

    user.password_hash = hash_password(body.new_password)
    user.password_change_code_hash = None
    user.password_change_code_expires_at = None
    user.password_change_code_attempts = 0
    user.token_version = int(user.token_version or 0) + 1
    await _revoke_all_sessions(db, user.id)
    await record_audit(
        db, action="password_change", user_id=user.id, request=request, trust_proxy=settings.trust_proxy
    )
    await db.flush()
    await db.refresh(user)
    return PasswordChangeConfirmResponse(detail="Password updated")
