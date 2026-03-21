from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, LargeBinary
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
