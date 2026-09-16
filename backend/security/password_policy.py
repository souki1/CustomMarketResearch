"""Server-side password policy (NIST-inspired length + enterprise complexity)."""

from __future__ import annotations

import re

# bcrypt truncates after 72 bytes.
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 72

_COMMON_PASSWORDS = {
    "password",
    "password1",
    "password12",
    "password123",
    "1234567890",
    "123456789",
    "12345678",
    "qwerty123",
    "qwertyuiop",
    "letmein123",
    "welcome123",
    "admin1234",
    "iloveyou1",
    "monkey123",
    "dragon123",
    "master123",
    "abc123456",
    "passw0rd",
    "changeme1",
    "changeme123",
}

_HAS_LETTER = re.compile(r"[A-Za-z]")
_HAS_DIGIT = re.compile(r"\d")


def validate_password(password: str, email: str | None = None) -> str | None:
    """Return an error message if the password is not acceptable, else None."""
    if not isinstance(password, str) or not password:
        return "Password is required"
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if len(password.encode("utf-8")) > MAX_PASSWORD_LENGTH:
        return f"Password must be at most {MAX_PASSWORD_LENGTH} characters"
    if password != password.strip():
        return "Password cannot start or end with whitespace"
    if any(ch.isspace() for ch in password):
        return "Password cannot contain spaces"
    if not _HAS_LETTER.search(password) or not _HAS_DIGIT.search(password):
        return "Password must include at least one letter and one number"
    lowered = password.lower()
    if lowered in _COMMON_PASSWORDS:
        return "This password is too common. Choose a stronger one"
    if email:
        local = email.split("@")[0].strip().lower()
        if local and len(local) >= 3 and local in lowered:
            return "Password cannot contain your email address"
    return None
