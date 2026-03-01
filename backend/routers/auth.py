from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import create_access_token, decode_access_token, hash_password, verify_password
from config import get_settings
from database import get_db
from models import User
from schemas import SignInBody, SignUpBody, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

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
    params = urlencode({"token": jwt_token, "display_name": user.display_name})
    return RedirectResponse(settings.frontend_url + "/auth/callback?" + params)


@router.get("/me")
async def me(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
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
    return {"id": user.id, "email": user.email, "display_name": user.display_name}
