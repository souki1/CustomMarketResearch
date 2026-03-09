import time
import hashlib
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Annotated
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import create_access_token, decode_access_token, hash_password, verify_password
from config import get_settings
from database import get_db
from models import User
from schemas import (
    PasswordChangeConfirmBody,
    PasswordChangeConfirmResponse,
    PasswordChangeRequestBody,
    PasswordChangeRequestResponse,
    SignInBody,
    SignUpBody,
    TokenResponse,
    UpdateProfileBody,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
_BACKEND_DIR = Path(__file__).resolve().parent.parent
PROFILE_PHOTO_DIR = _BACKEND_DIR / "uploads" / "profiles"
PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_ATTEMPTS = 5


def _hash_otp(user_id: int, code: str) -> str:
    raw = f"{settings.secret_key}:{user_id}:{code}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _send_email_code(to_email: str, code: str) -> str:
    """
    Send a verification code via SMTP if configured.
    Returns delivery string: 'smtp' or 'console'.
    """
    if not settings.smtp_host or not settings.smtp_from:
        # Dev fallback: print code to backend console.
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
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
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
async def signup(body: SignUpBody, db: AsyncSession = Depends(get_db)):
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
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, display_name=user.display_name)


@router.post("/signin", response_model=TokenResponse)
async def signin(body: SignInBody, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, display_name=user.display_name)


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
    await db.flush()
    await db.refresh(user)
    jwt_token = create_access_token(user.id)
    params = urlencode({
        "token": jwt_token,
        "display_name": user.display_name,
        "email": user.email,
    })
    return RedirectResponse(settings.frontend_url + "/auth/callback?" + params)


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        phone=user.phone,
        job_title=user.job_title,
        profile_photo_url=user.profile_photo_url,
    )


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
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        phone=user.phone,
        job_title=user.job_title,
        profile_photo_url=user.profile_photo_url,
    )


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
    safe_name = f"{user.id}_{int(time.time() * 1000)}{ext}"
    dest = PROFILE_PHOTO_DIR / safe_name
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    dest.write_bytes(content)
    # Store URL path the frontend can use (same origin as API)
    user.profile_photo_url = f"/auth/profile-photo/{safe_name}"
    await db.flush()
    await db.refresh(user)
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        phone=user.phone,
        job_title=user.job_title,
        profile_photo_url=user.profile_photo_url,
    )


@router.get("/profile-photo/{filename}")
async def get_profile_photo(filename: str):
    """Serve uploaded profile photo. Filename must be safe (e.g. userid_timestamp.ext)."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = PROFILE_PHOTO_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path)


@router.post("/change-password/request", response_model=PasswordChangeRequestResponse)
async def request_password_change(
    body: PasswordChangeRequestBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if body.channel == "sms":
        raise HTTPException(status_code=400, detail="SMS delivery is not configured yet. Use email.")

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
    if settings.dev_return_otp:
        resp.dev_code = code
    return resp


@router.post("/change-password/confirm", response_model=PasswordChangeConfirmResponse)
async def confirm_password_change(
    body: PasswordChangeConfirmBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")
    if not body.new_password or len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

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

    user.password_hash = hash_password(body.new_password)
    user.password_change_code_hash = None
    user.password_change_code_expires_at = None
    user.password_change_code_attempts = 0
    await db.flush()
    await db.refresh(user)
    return PasswordChangeConfirmResponse(detail="Password updated")
