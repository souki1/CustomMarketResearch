import secrets
import smtplib
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import (
    PURPOSE_2FA,
    PURPOSE_ACCESS,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from config import get_settings
from database import get_db
from models import AuthSession, User
from schemas import (
    AuthExchangeBody,
    AuthSessionResponse,
    DeleteAccountBody,
    PasswordChangeConfirmBody,
    PasswordChangeConfirmResponse,
    PasswordChangeRequestBody,
    PasswordChangeRequestResponse,
    SignInBody,
    SignUpBody,
    TokenResponse,
    TwoFactorConfirmBody,
    TwoFactorResendBody,
    TwoFactorVerifyBody,
    UpdateProfileBody,
    UserResponse,
)
from security import (
    LOCKOUT_MINUTES,
    LOGIN_FAILURE_LIMIT,
    OTP_MAX_ATTEMPTS,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_MINUTES,
    client_ip,
    consume_exchange_code,
    enforce_rate_limit,
    hash_otp,
    issue_exchange_code,
    otp_matches,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

TwoFactorPurpose = Literal["login", "enable", "disable"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _send_email_code(to_email: str, code: str, subject: str = "Your verification code") -> str:
    """
    Send a verification code via SMTP if configured.
    Returns delivery string: 'smtp' or 'console'.
    """
    if not settings.smtp_host or not settings.smtp_from:
        print(f"[DEV] Verification code for {to_email}: {code}")  # noqa: T201
        return "console"

    msg = EmailMessage()
    msg["Subject"] = subject
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


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        phone=user.phone,
        job_title=user.job_title,
        profile_photo_url=user.profile_photo_url,
        has_password=bool(user.password_hash),
        google_linked=bool(user.google_id),
        two_factor_enabled=bool(user.two_factor_enabled),
    )


async def _issue_session_token(db: AsyncSession, user: User, request: Request) -> str:
    jti = secrets.token_urlsafe(24)
    now = _utcnow()
    minutes = settings.access_token_expire_minutes or 10080
    session = AuthSession(
        user_id=user.id,
        jti=jti,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(minutes=minutes),
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        ip_address=client_ip(request),
    )
    db.add(session)
    await db.flush()
    return create_access_token(
        user.id,
        extra={"ver": user.token_version, "jti": jti, "purpose": PURPOSE_ACCESS},
    )


async def _revoke_sessions(db: AsyncSession, user_id: int, *, except_jti: str | None = None) -> None:
    now = _utcnow()
    stmt = (
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    )
    if except_jti:
        stmt = stmt.where(AuthSession.jti != except_jti)
    await db.execute(stmt.values(revoked_at=now))


def _assert_account_usable(user: User | None) -> User:
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    locked_until = _as_utc(user.locked_until)
    if locked_until and locked_until > _utcnow():
        raise HTTPException(
            status_code=423,
            detail="Account temporarily locked after too many failed sign-in attempts. Try again later.",
        )
    return user


async def _record_login_failure(user: User) -> None:
    user.failed_login_count = (user.failed_login_count or 0) + 1
    if user.failed_login_count >= LOGIN_FAILURE_LIMIT:
        user.locked_until = _utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        user.failed_login_count = 0


def _clear_login_failures(user: User) -> None:
    user.failed_login_count = 0
    user.locked_until = None


async def _issue_otp(
    user: User,
    *,
    purpose: TwoFactorPurpose,
    subject: str,
) -> tuple[str, str | None]:
    now = _utcnow()
    last_sent = _as_utc(user.two_factor_code_last_sent_at)
    if last_sent is not None:
        delta = (now - last_sent).total_seconds()
        if delta < OTP_RESEND_COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail="Please wait before requesting another code")

    code = f"{secrets.randbelow(1_000_000):06d}"
    user.two_factor_code_hash = hash_otp(user.id, code)
    user.two_factor_code_expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    user.two_factor_code_last_sent_at = now
    user.two_factor_code_attempts = 0
    user.two_factor_code_purpose = purpose
    delivery = _send_email_code(user.email, code, subject=subject)
    return delivery, code if settings.dev_return_otp else None


async def _consume_otp(db: AsyncSession, user: User, code: str, purpose: TwoFactorPurpose) -> None:
    now = _utcnow()
    if (
        not user.two_factor_code_hash
        or not user.two_factor_code_expires_at
        or user.two_factor_code_purpose != purpose
    ):
        raise HTTPException(status_code=400, detail="No active verification code. Request a new code.")
    if _as_utc(user.two_factor_code_expires_at) < now:
        raise HTTPException(status_code=400, detail="Code expired. Request a new code.")
    if (user.two_factor_code_attempts or 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")
    if not otp_matches(user.id, code, user.two_factor_code_hash):
        user.two_factor_code_attempts = (user.two_factor_code_attempts or 0) + 1
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid code")
    user.two_factor_code_hash = None
    user.two_factor_code_expires_at = None
    user.two_factor_code_attempts = 0
    user.two_factor_code_purpose = None


def _two_factor_pending_token(user: User) -> str:
    return create_access_token(
        user.id,
        extra={"purpose": PURPOSE_2FA, "ver": user.token_version},
        minutes=10,
    )


async def _user_from_two_factor_token(db: AsyncSession, token: str) -> User:
    payload = decode_access_token(token)
    if not payload or payload.get("purpose") != PURPOSE_2FA or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired verification session")
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or expired verification session")
    if "ver" in payload and int(payload["ver"]) != (user.token_version or 0):
        raise HTTPException(status_code=401, detail="Invalid or expired verification session")
    return user


async def _complete_login(db: AsyncSession, user: User, request: Request) -> TokenResponse:
    _clear_login_failures(user)
    token = await _issue_session_token(db, user, request)
    return TokenResponse(access_token=token, display_name=user.display_name, email=user.email)


async def _begin_two_factor_login(user: User) -> TokenResponse:
    delivery, _dev = await _issue_otp(
        user,
        purpose="login",
        subject="Your sign-in verification code",
    )
    del delivery
    return TokenResponse(
        requires_2fa=True,
        two_factor_token=_two_factor_pending_token(user),
        display_name=user.display_name,
        email=user.email,
    )


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    purpose = payload.get("purpose")
    if purpose is not None and purpose != PURPOSE_ACCESS:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    if "ver" in payload and int(payload["ver"]) != (user.token_version or 0):
        raise HTTPException(status_code=401, detail="Session expired")
    jti = payload.get("jti")
    if isinstance(jti, str) and jti:
        session_result = await db.execute(
            select(AuthSession).where(AuthSession.jti == jti, AuthSession.user_id == user.id)
        )
        session = session_result.scalar_one_or_none()
        now = _utcnow()
        if not session or session.revoked_at is not None or _as_utc(session.expires_at) < now:
            raise HTTPException(status_code=401, detail="Session expired")
        last_seen = _as_utc(session.last_seen_at)
        if last_seen is None or (now - last_seen).total_seconds() > 60:
            session.last_seen_at = now
        request.state.token_jti = jti
        request.state.auth_session_id = session.id
    else:
        request.state.token_jti = None
        request.state.auth_session_id = None
    return user


oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    client_kwargs={"scope": "openid email profile"},
)


def _display_name_from_email(email: str) -> str:
    local = email.split("@")[0] or "User"
    cleaned = " ".join(word.capitalize() for word in local.replace(".", " ").replace("_", " ").split())
    return cleaned or "User"


@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignUpBody, request: Request, db: AsyncSession = Depends(get_db)):
    enforce_rate_limit(f"signup:{client_ip(request) or 'unknown'}", 5, 3600)
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    display_name = body.display_name or _display_name_from_email(body.email)
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=display_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    token = await _issue_session_token(db, user, request)
    return TokenResponse(access_token=token, display_name=user.display_name, email=user.email)


@router.post("/signin", response_model=TokenResponse)
async def signin(body: SignInBody, request: Request, db: AsyncSession = Depends(get_db)):
    enforce_rate_limit(f"signin:{client_ip(request) or 'unknown'}", 10, 900)
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _assert_account_usable(user)
    if not verify_password(body.password, user.password_hash):
        await _record_login_failure(user)
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.two_factor_enabled:
        return await _begin_two_factor_login(user)
    return await _complete_login(db, user, request)


@router.post("/signin/verify-2fa", response_model=TokenResponse)
async def verify_signin_2fa(
    body: TwoFactorVerifyBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(f"2fa:{client_ip(request) or 'unknown'}", 10, 900)
    user = await _user_from_two_factor_token(db, body.two_factor_token)
    await _consume_otp(db, user, body.code, "login")
    return await _complete_login(db, user, request)


@router.post("/signin/resend-2fa", response_model=PasswordChangeRequestResponse)
async def resend_signin_2fa(
    body: TwoFactorResendBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(f"2fa-resend:{client_ip(request) or 'unknown'}", 5, 900)
    user = await _user_from_two_factor_token(db, body.two_factor_token)
    delivery, dev_code = await _issue_otp(
        user,
        purpose="login",
        subject="Your sign-in verification code",
    )
    resp = PasswordChangeRequestResponse(detail="Verification code sent", delivery=delivery)
    if dev_code:
        resp.dev_code = dev_code
    return resp


@router.post("/exchange", response_model=TokenResponse)
async def exchange_login_code(
    body: AuthExchangeBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(f"exchange:{client_ip(request) or 'unknown'}", 20, 900)
    user_id = consume_exchange_code(body.code)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired sign-in code")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or expired sign-in code")
    if user.two_factor_enabled:
        return await _begin_two_factor_login(user)
    return await _complete_login(db, user, request)


@router.get("/google")
async def google_login(request: Request):
    base = str(request.base_url).rstrip("/")
    redirect_uri = f"{base}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        return RedirectResponse(settings.frontend_url + "/signin?error=google_denied")
    userinfo = token.get("userinfo")
    if not userinfo:
        return RedirectResponse(settings.frontend_url + "/signin?error=no_userinfo")
    email = userinfo.get("email")
    google_id = userinfo.get("sub")
    name = userinfo.get("name") or userinfo.get("email", "").split("@")[0] or "User"
    if not email or not google_id:
        return RedirectResponse(settings.frontend_url + "/signin?error=missing_email")
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()
    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            if not user.is_active:
                return RedirectResponse(settings.frontend_url + "/signin?error=account_disabled")
            user.google_id = google_id
            if not user.display_name or user.display_name == _display_name_from_email(user.email):
                user.display_name = name
        else:
            user = User(
                email=email,
                password_hash=None,
                display_name=name,
                google_id=google_id,
            )
            db.add(user)
    elif not user.is_active:
        return RedirectResponse(settings.frontend_url + "/signin?error=account_disabled")
    await db.flush()
    await db.refresh(user)
    code = issue_exchange_code(user.id)
    params = urlencode({"code": code})
    return RedirectResponse(settings.frontend_url + "/auth/callback?" + params)


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


ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


@router.post("/me/photo", response_model=UserResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Allowed formats: " + ", ".join(ALLOWED_PHOTO_EXTENSIONS),
        )
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    user.profile_photo_content_type = file.content_type or "application/octet-stream"
    user.profile_photo_data = content
    safe_name = f"{user.id}_{int(time.time() * 1000)}{ext}"
    user.profile_photo_url = f"/auth/profile-photo/{safe_name}"
    await db.flush()
    await db.refresh(user)
    return _user_response(user)


@router.get("/profile-photo/{filename}")
async def get_profile_photo(filename: str, db: Annotated[AsyncSession, Depends(get_db)]):
    """Serve profile photo stored in the database, looked up by URL suffix."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    url_path = f"/auth/profile-photo/{filename}"
    result = await db.execute(select(User).where(User.profile_photo_url == url_path))
    user = result.scalar_one_or_none()
    if not user or not user.profile_photo_data:
        raise HTTPException(status_code=404, detail="Not found")

    media_type = user.profile_photo_content_type or "image/png"
    return Response(content=user.profile_photo_data, media_type=media_type)


@router.post("/change-password/request", response_model=PasswordChangeRequestResponse)
async def request_password_change(
    body: PasswordChangeRequestBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if body.channel == "sms":
        raise HTTPException(status_code=400, detail="SMS delivery is not configured yet. Use email.")

    now = _utcnow()
    if user.password_change_code_last_sent_at is not None:
        delta = (now - _as_utc(user.password_change_code_last_sent_at)).total_seconds()
        if delta < OTP_RESEND_COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail="Please wait before requesting another code")

    code = f"{secrets.randbelow(1_000_000):06d}"
    user.password_change_code_hash = hash_otp(user.id, code)
    user.password_change_code_expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    user.password_change_code_last_sent_at = now
    user.password_change_code_attempts = 0
    await db.flush()

    delivery = _send_email_code(user.email, code, subject="Your password change code")
    resp = PasswordChangeRequestResponse(detail="Verification code sent", delivery=delivery)
    if settings.dev_return_otp:
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

    now = _utcnow()
    if not user.password_change_code_hash or not user.password_change_code_expires_at:
        raise HTTPException(status_code=400, detail="No active verification code. Request a new code.")
    if _as_utc(user.password_change_code_expires_at) < now:
        raise HTTPException(status_code=400, detail="Code expired. Request a new code.")
    if user.password_change_code_attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")

    if not otp_matches(user.id, code, user.password_change_code_hash):
        user.password_change_code_attempts += 1
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid code")

    user.password_hash = hash_password(body.new_password)
    user.password_change_code_hash = None
    user.password_change_code_expires_at = None
    user.password_change_code_attempts = 0
    user.token_version = (user.token_version or 0) + 1
    await _revoke_sessions(db, user.id)
    token = await _issue_session_token(db, user, request)
    await db.flush()
    await db.refresh(user)
    return PasswordChangeConfirmResponse(detail="Password updated", access_token=token)


@router.post("/2fa/enable/request", response_model=PasswordChangeRequestResponse)
async def request_enable_2fa(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is already on")
    delivery, dev_code = await _issue_otp(
        user,
        purpose="enable",
        subject="Enable two-factor authentication",
    )
    resp = PasswordChangeRequestResponse(detail="Verification code sent", delivery=delivery)
    if dev_code:
        resp.dev_code = dev_code
    return resp


@router.post("/2fa/enable/confirm", response_model=UserResponse)
async def confirm_enable_2fa(
    body: TwoFactorConfirmBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await _consume_otp(db, user, body.code, "enable")
    user.two_factor_enabled = True
    return _user_response(user)


@router.post("/2fa/disable/request", response_model=PasswordChangeRequestResponse)
async def request_disable_2fa(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if not user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is already off")
    delivery, dev_code = await _issue_otp(
        user,
        purpose="disable",
        subject="Disable two-factor authentication",
    )
    resp = PasswordChangeRequestResponse(detail="Verification code sent", delivery=delivery)
    if dev_code:
        resp.dev_code = dev_code
    return resp


@router.post("/2fa/disable/confirm", response_model=UserResponse)
async def confirm_disable_2fa(
    body: TwoFactorConfirmBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await _consume_otp(db, user, body.code, "disable")
    user.two_factor_enabled = False
    return _user_response(user)


@router.get("/sessions", response_model=list[AuthSessionResponse])
async def list_sessions(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    now = _utcnow()
    result = await db.execute(
        select(AuthSession)
        .where(
            AuthSession.user_id == user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
        .order_by(AuthSession.last_seen_at.desc())
    )
    current_id = getattr(request.state, "auth_session_id", None)
    sessions = []
    for row in result.scalars().all():
        sessions.append(
            AuthSessionResponse(
                id=row.id,
                created_at=row.created_at,
                last_seen_at=row.last_seen_at,
                expires_at=row.expires_at,
                user_agent=row.user_agent,
                ip_address=row.ip_address,
                current=current_id is not None and row.id == current_id,
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
    session.revoked_at = _utcnow()
    current_id = getattr(request.state, "auth_session_id", None)
    return {"detail": "Session revoked", "current": current_id == session.id}


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    jti = getattr(request.state, "token_jti", None)
    await _revoke_sessions(db, user.id, except_jti=jti)
    return {"detail": "Other sessions signed out"}


@router.post("/logout")
async def logout(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    jti = getattr(request.state, "token_jti", None)
    if jti:
        result = await db.execute(
            select(AuthSession).where(AuthSession.jti == jti, AuthSession.user_id == user.id)
        )
        session = result.scalar_one_or_none()
        if session and session.revoked_at is None:
            session.revoked_at = _utcnow()
    return {"detail": "Signed out"}


@router.post("/me/delete")
async def delete_account(
    body: DeleteAccountBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if (body.confirmation or "").strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail='Type DELETE to confirm account deletion')
    if (body.email or "").strip().lower() != user.email.lower():
        raise HTTPException(status_code=400, detail="Email does not match this account")
    if user.password_hash:
        if not body.password or not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Password is incorrect")
    user.is_active = False
    user.token_version = (user.token_version or 0) + 1
    user.google_id = None
    user.password_hash = None
    user.two_factor_enabled = False
    user.profile_photo_data = None
    user.email = f"deleted-{user.id}-{int(_utcnow().timestamp())}@deleted.invalid"
    await _revoke_sessions(db, user.id)
    await db.flush()
    return {"detail": "Account deleted"}
