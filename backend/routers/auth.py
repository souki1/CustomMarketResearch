import io
import time
import hashlib
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Annotated
from urllib.parse import urlencode

import pyotp
import qrcode
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse, Response
from qrcode.image.svg import SvgPathImage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from audit import record_audit
from auth_utils import (
    PENDING_2FA_TOKEN_TYPE,
    create_pending_2fa_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from config import get_settings
from crypto_secrets import decrypt_str, encrypt_str, hmac_sha256
from database import get_db
from deps import get_current_user
from models import AuthSession, OAuthExchangeCode, User
from schemas import (
    GoogleExchangeBody,
    PasswordChangeConfirmBody,
    PasswordChangeConfirmResponse,
    PasswordChangeRequestBody,
    PasswordChangeRequestResponse,
    SignInBody,
    SignUpBody,
    TokenResponse,
    TotpVerifyBody,
    UpdateProfileBody,
    UserResponse,
)
from security import (
    LOGIN_LOCKOUT_MINUTES,
    LOGIN_LOCKOUT_THRESHOLD,
    assert_safe_image_bytes,
    rate_limit_auth,
    validate_password_strength,
)
from sessions import create_user_session

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_ATTEMPTS = 5
OAUTH_CODE_TTL_SECONDS = 120
TOTP_ISSUER = "Intelligent Research"
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _hash_otp(user_id: int, code: str) -> str:
    raw = f"{settings.secret_key}:{user_id}:{code}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _send_email_code(to_email: str, code: str) -> str:
    """
    Send a verification code via SMTP if configured.
    Returns delivery string: 'smtp' or 'console'.
    """
    if not settings.smtp_host or not settings.smtp_from:
        print(f"[DEV] Password change code for {to_email}: {code}")  # noqa: T201
        return "console"

    msg = EmailMessage()
    msg["Subject"] = "Your verification code"
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


def to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        phone=user.phone,
        job_title=user.job_title,
        profile_photo_url=user.profile_photo_url,
        totp_enabled=bool(user.totp_enabled),
        has_password=bool(user.password_hash),
    )


def _token_response(user: User, access_token: str) -> TokenResponse:
    return TokenResponse(access_token=access_token, display_name=user.display_name, email=user.email)


def totp_qr_svg(otpauth_url: str) -> str:
    img = qrcode.make(otpauth_url, image_factory=SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8")


def verify_totp_code(stored_secret: str, code: str) -> bool:
    secret = decrypt_str(stored_secret) or stored_secret
    return bool(pyotp.TOTP(secret).verify(code.strip(), valid_window=1))


def _display_name_from_email(email: str) -> str:
    local = email.split("@")[0] or "User"
    cleaned = " ".join(word.capitalize() for word in local.replace(".", " ").replace("_", " ").split())
    return cleaned or "User"


def _account_locked(user: User, now: datetime) -> bool:
    return user.locked_until is not None and user.locked_until > now


async def _register_failed_login(db: AsyncSession, user: User, request: Request) -> None:
    now = datetime.now(timezone.utc)
    user.failed_login_count = (user.failed_login_count or 0) + 1
    if user.failed_login_count >= LOGIN_LOCKOUT_THRESHOLD:
        user.locked_until = now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        user.failed_login_count = 0
        await record_audit(db, user_id=user.id, action="login_lockout", request=request)
    else:
        await record_audit(db, user_id=user.id, action="login_failed", request=request)


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
    await rate_limit_auth(request, "signup", limit=8, window_seconds=900)
    email = str(body.email).strip().lower()
    validate_password_strength(body.password, email)
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    display_name = body.display_name or _display_name_from_email(email)
    try:
        password_hash = hash_password(body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        password_hash=password_hash,
        display_name=display_name,
        password_changed_at=now,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    issued = await create_user_session(db, user, request)
    await record_audit(db, user_id=user.id, action="signup", request=request)
    return _token_response(user, issued.token)


@router.post("/signin", response_model=TokenResponse)
async def signin(body: SignInBody, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit_auth(request, "signin", limit=12, window_seconds=900)
    email = str(body.email).strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not user or not user.password_hash:
        await record_audit(db, user_id=user.id if user else None, action="login_failed", request=request)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")
    if _account_locked(user, now):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
    if not verify_password(body.password, user.password_hash):
        await _register_failed_login(db, user, request)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.totp_enabled:
        pending = create_pending_2fa_token(user.id)
        await record_audit(db, user_id=user.id, action="login_2fa_challenge", request=request)
        return TokenResponse(
            requires_2fa=True,
            pending_token=pending.token,
            display_name=user.display_name,
            email=user.email,
        )
    issued = await create_user_session(db, user, request)
    await record_audit(db, user_id=user.id, action="login", request=request)
    return _token_response(user, issued.token)


@router.post("/2fa/verify", response_model=TokenResponse)
async def verify_login_2fa(body: TotpVerifyBody, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit_auth(request, "totp_verify", limit=10, window_seconds=600)
    payload = decode_access_token(body.pending_token)
    if not payload or payload.get("typ") != PENDING_2FA_TOKEN_TYPE or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired verification token")
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=401, detail="Invalid or expired verification token")
    if not verify_totp_code(user.totp_secret, body.code):
        await record_audit(db, user_id=user.id, action="login_2fa_failed", request=request)
        raise HTTPException(status_code=401, detail="Invalid authenticator code")
    issued = await create_user_session(db, user, request)
    await record_audit(db, user_id=user.id, action="login", request=request)
    return _token_response(user, issued.token)


@router.get("/google")
async def google_login(request: Request):
    await rate_limit_auth(request, "google_login", limit=20, window_seconds=900)
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
    email = (userinfo.get("email") or "").strip().lower()
    google_id = userinfo.get("sub")
    name = userinfo.get("name") or (email.split("@")[0] if email else "User")
    if not email or not google_id:
        return RedirectResponse(settings.frontend_url + "/signin?error=missing_email")
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
            )
            db.add(user)
    if user and not user.is_active:
        return RedirectResponse(settings.frontend_url + "/signin?error=account_disabled")
    await db.flush()
    await db.refresh(user)
    raw_code = secrets.token_urlsafe(32)
    db.add(
        OAuthExchangeCode(
            code_hash=hmac_sha256(raw_code),
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=OAUTH_CODE_TTL_SECONDS),
        )
    )
    await record_audit(db, user_id=user.id, action="google_callback", request=request)
    params = urlencode({"code": raw_code})
    return RedirectResponse(settings.frontend_url + "/auth/callback?" + params)


@router.post("/google/exchange", response_model=TokenResponse)
async def google_exchange(body: GoogleExchangeBody, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit_auth(request, "google_exchange", limit=12, window_seconds=600)
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(OAuthExchangeCode).where(OAuthExchangeCode.code_hash == hmac_sha256(body.code))
    )
    row = result.scalar_one_or_none()
    if not row or row.used_at is not None or row.expires_at < now:
        raise HTTPException(status_code=401, detail="Invalid or expired sign-in code")
    row.used_at = now
    user_result = await db.execute(select(User).where(User.id == row.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    if user.totp_enabled:
        pending = create_pending_2fa_token(user.id)
        return TokenResponse(
            requires_2fa=True,
            pending_token=pending.token,
            display_name=user.display_name,
            email=user.email,
        )
    issued = await create_user_session(db, user, request)
    await record_audit(db, user_id=user.id, action="login", request=request)
    return _token_response(user, issued.token)


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return to_user_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateProfileBody,
    request: Request,
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
    await record_audit(db, user_id=user.id, action="profile_update", request=request)
    return to_user_response(user)


@router.post("/me/photo", response_model=UserResponse)
async def upload_profile_photo(
    request: Request,
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
            detail="Allowed formats: " + ", ".join(sorted(ALLOWED_PHOTO_EXTENSIONS)),
        )
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    sniffed = assert_safe_image_bytes(content)
    user.profile_photo_content_type = sniffed
    user.profile_photo_data = content
    safe_name = f"{user.id}_{int(time.time() * 1000)}{ext}"
    user.profile_photo_url = f"/auth/profile-photo/{safe_name}"
    await db.flush()
    await db.refresh(user)
    await record_audit(db, user_id=user.id, action="profile_photo_update", request=request)
    return to_user_response(user)


@router.get("/profile-photo/{filename}")
async def get_profile_photo(filename: str, db: Annotated[AsyncSession, Depends(get_db)]):
    """Serve profile photo stored in the database, looked up by unguessable URL suffix."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    url_path = f"/auth/profile-photo/{filename}"
    result = await db.execute(select(User).where(User.profile_photo_url == url_path))
    user = result.scalar_one_or_none()
    if not user or not user.profile_photo_data:
        raise HTTPException(status_code=404, detail="Not found")

    media_type = user.profile_photo_content_type or "image/png"
    return Response(
        content=user.profile_photo_data,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/change-password/request", response_model=PasswordChangeRequestResponse)
async def request_password_change(
    body: PasswordChangeRequestBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await rate_limit_auth(request, "password_otp", limit=5, window_seconds=900)
    if body.channel == "sms":
        raise HTTPException(status_code=400, detail="SMS delivery is not configured yet. Use email.")
    if not user.password_hash:
        raise HTTPException(status_code=400, detail="This account uses Google sign-in and has no password.")

    now = datetime.now(timezone.utc)
    if user.password_change_code_last_sent_at is not None:
        delta = (now - user.password_change_code_last_sent_at).total_seconds()
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
    validate_password_strength(body.new_password, user.email)

    now = datetime.now(timezone.utc)
    if not user.password_change_code_hash or not user.password_change_code_expires_at:
        raise HTTPException(status_code=400, detail="No active verification code. Request a new code.")
    if user.password_change_code_expires_at < now:
        raise HTTPException(status_code=400, detail="Code expired. Request a new code.")
    if user.password_change_code_attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")

    if _hash_otp(user.id, code) != user.password_change_code_hash:
        user.password_change_code_attempts += 1
        await db.flush()
        raise HTTPException(status_code=400, detail="Invalid code")

    try:
        user.password_hash = hash_password(body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    user.password_change_code_hash = None
    user.password_change_code_expires_at = None
    user.password_change_code_attempts = 0
    user.password_changed_at = now

    current_jti = getattr(request.state, "session_jti", None)
    sessions = (await db.execute(select(AuthSession).where(AuthSession.user_id == user.id))).scalars().all()
    for session in sessions:
        if session.jti != current_jti and session.revoked_at is None:
            session.revoked_at = now
    await db.flush()
    await db.refresh(user)
    await record_audit(db, user_id=user.id, action="password_change", request=request)
    return PasswordChangeConfirmResponse(detail="Password updated")
