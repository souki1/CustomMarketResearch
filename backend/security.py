"""Auth security helpers: password policy, rate limits, OTP hashing, client IP."""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request

from config import get_settings

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_BYTES = 72  # bcrypt limit
LOGIN_FAILURE_LIMIT = 5
LOCKOUT_MINUTES = 15
OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_ATTEMPTS = 5
EXCHANGE_CODE_TTL_SECONDS = 120

_PASSWORD_LETTER = re.compile(r"[A-Za-z]")
_PASSWORD_DIGIT = re.compile(r"\d")

_rate_lock = threading.Lock()
_rate_hits: dict[str, list[float]] = defaultdict(list)

_exchange_lock = threading.Lock()
_exchange_codes: dict[str, dict] = {}


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        return ip[:64] or None
    if request.client and request.client.host:
        return request.client.host[:64]
    return None


def assert_password_policy(password: str) -> str:
    value = (password or "").strip()
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
    if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError("Password is too long")
    if not _PASSWORD_LETTER.search(value) or not _PASSWORD_DIGIT.search(value):
        raise ValueError("Password must include a letter and a number")
    return value


def hash_otp(user_id: int, code: str) -> str:
    settings = get_settings()
    raw = f"{settings.secret_key}:{user_id}:{code}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def otp_matches(user_id: int, code: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    digest = hash_otp(user_id, (code or "").strip())
    return hmac.compare_digest(digest, stored_hash)


def enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _rate_lock:
        bucket = _rate_hits[key]
        bucket[:] = [stamp for stamp in bucket if stamp > cutoff]
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please wait and try again.",
            )
        bucket.append(now)


def issue_exchange_code(user_id: int) -> str:
    code = secrets.token_urlsafe(32)
    now = time.time()
    with _exchange_lock:
        expired = [key for key, row in _exchange_codes.items() if row["exp"] <= now]
        for key in expired:
            _exchange_codes.pop(key, None)
        _exchange_codes[code] = {"user_id": user_id, "exp": now + EXCHANGE_CODE_TTL_SECONDS}
    return code


def consume_exchange_code(code: str) -> int | None:
    token = (code or "").strip()
    if not token:
        return None
    with _exchange_lock:
        row = _exchange_codes.pop(token, None)
    if not row or row["exp"] <= time.time():
        return None
    return int(row["user_id"])
