from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, LargeBinary, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # null for Google-only
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    profile_photo_content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    profile_photo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    password_change_code_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_change_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_change_code_last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_change_code_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_pending_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    totp_backup_hashes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AuthExchangeCode(Base):
    """One-time OAuth handshake so JWTs are never placed in redirect URLs."""

    __tablename__ = "auth_exchange_codes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    detail: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True
    )


class WorkspaceItem(Base):
    __tablename__ = "workspace_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_folder: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("workspace_items.id", ondelete="CASCADE"),
        nullable=True,
    )
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    access: Mapped[str] = mapped_column(String(50), nullable=False, default="Edit")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )
    last_opened: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
