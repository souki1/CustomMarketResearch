"""Secret hashing / encryption for API keys, OAuth codes, and TOTP seeds."""

from __future__ import annotations

import base64
import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken

from config import get_settings


def _secret_bytes() -> bytes:
    return (get_settings().secret_key or "dev-insecure-key").encode("utf-8")


def hmac_sha256(value: str) -> str:
    return hmac.new(_secret_bytes(), value.encode("utf-8"), hashlib.sha256).hexdigest()


def _fernet() -> Fernet:
    digest = hashlib.sha256(_secret_bytes()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_str(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_str(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
