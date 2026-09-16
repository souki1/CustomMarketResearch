"""Enterprise security helpers: password policy, rate limits, headers, file sniffing."""

from __future__ import annotations

import asyncio
import re
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 72
LOGIN_LOCKOUT_THRESHOLD = 5
LOGIN_LOCKOUT_MINUTES = 15

_COMMON_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password123",
        "12345678",
        "qwerty123",
        "letmein1",
        "welcome1",
        "admin123",
        "changeme",
        "passw0rd",
    }
)


def validate_password_strength(password: str, email: str | None = None) -> None:
    """Raise HTTP 400 if the password does not meet enterprise policy."""
    if not isinstance(password, str):
        raise HTTPException(status_code=400, detail="Password is required")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail="Password is too long")
    if password.strip() != password:
        raise HTTPException(status_code=400, detail="Password cannot start or end with spaces")
    if not any(ch.isalpha() for ch in password) or not any(ch.isdigit() for ch in password):
        raise HTTPException(status_code=400, detail="Password must include a letter and a number")
    lowered = password.lower()
    if lowered in _COMMON_PASSWORDS:
        raise HTTPException(status_code=400, detail="Password is too common")
    if email:
        local = email.split("@")[0].strip().lower()
        if local and len(local) >= 3 and local in lowered:
            raise HTTPException(
                status_code=400,
                detail="Password cannot contain your email address",
            )


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return "unknown"


def client_user_agent(request: Request) -> str:
    return (request.headers.get("user-agent") or "")[:300]


class SlidingWindowLimiter:
    """In-process sliding-window limiter. Sufficient for a single API instance."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def hit(self, key: str, *, limit: int, window_seconds: float) -> None:
        now = time.monotonic()
        async with self._lock:
            recent = [stamp for stamp in self._hits[key] if now - stamp < window_seconds]
            if len(recent) >= limit:
                self._hits[key] = recent
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Try again later.",
                    headers={"Retry-After": str(int(window_seconds))},
                )
            recent.append(now)
            self._hits[key] = recent
            if len(self._hits) > 10_000:
                stale = [k for k, stamps in self._hits.items() if not stamps]
                for k in stale:
                    self._hits.pop(k, None)


auth_limiter = SlidingWindowLimiter()


async def rate_limit_auth(request: Request, bucket: str, *, limit: int, window_seconds: float) -> None:
    await auth_limiter.hit(f"{bucket}:{client_ip(request)}", limit=limit, window_seconds=window_seconds)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        request_id = (request.headers.get("x-request-id") or "").strip()[:64]
        if not request_id:
            request_id = f"{int(time.time() * 1000):x}"
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        response.headers["X-Request-ID"] = request_id
        if request.url.scheme == "https":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


_PNG = b"\x89PNG\r\n\x1a\n"
_JPEG = b"\xff\xd8\xff"
_GIF87 = b"GIF87a"
_GIF89 = b"GIF89a"
_ZIP = b"PK\x03\x04"
_SVG_HINT = re.compile(rb"<svg|<!doctype svg", re.IGNORECASE)


def sniff_image_content_type(content: bytes) -> str | None:
    if not content:
        return None
    if content.startswith(_JPEG):
        return "image/jpeg"
    if content.startswith(_PNG):
        return "image/png"
    if content.startswith(_GIF87) or content.startswith(_GIF89):
        return "image/gif"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def assert_safe_image_bytes(content: bytes) -> str:
    if _SVG_HINT.search(content[:200]) or content.lstrip().startswith(b"<svg") or content.lstrip().startswith(b"<?xml"):
        raise HTTPException(status_code=400, detail="SVG uploads are not allowed")
    sniffed = sniff_image_content_type(content)
    if not sniffed:
        raise HTTPException(status_code=400, detail="File is not a valid JPG, PNG, GIF, or WebP image")
    return sniffed


def assert_docx_bytes(content: bytes) -> None:
    if not content.startswith(_ZIP):
        raise HTTPException(status_code=400, detail="File is not a valid Word document")


def assert_csv_bytes(content: bytes) -> None:
    if b"\x00" in content[:4096]:
        raise HTTPException(status_code=400, detail="File is not a valid CSV")


def assert_secure_runtime(secret_key: str, *, is_production: bool, dev_return_otp: bool) -> None:
    if not is_production:
        return
    if not secret_key or len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be at least 32 characters in production")
    if secret_key in {"dev-secret-change-me", "changeme", "secret"}:
        raise RuntimeError("SECRET_KEY is insecure for production")
    if dev_return_otp:
        raise RuntimeError("DEV_RETURN_OTP must be disabled in production")
