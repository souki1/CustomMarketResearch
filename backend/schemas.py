from datetime import datetime

from pydantic import BaseModel, EmailStr
from typing import Literal


class SignUpBody(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None


class SignInBody(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    display_name: str


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    phone: str | None = None
    job_title: str | None = None
    profile_photo_url: str | None = None

    class Config:
        from_attributes = True


class UpdateProfileBody(BaseModel):
    display_name: str | None = None
    phone: str | None = None
    job_title: str | None = None


class PasswordChangeRequestBody(BaseModel):
    channel: Literal["email", "sms"] = "email"


class PasswordChangeRequestResponse(BaseModel):
    detail: str
    delivery: str | None = None
    dev_code: str | None = None


class PasswordChangeConfirmBody(BaseModel):
    code: str
    new_password: str


class PasswordChangeConfirmResponse(BaseModel):
    detail: str


class WorkspaceItemBase(BaseModel):
    id: int
    name: str
    is_folder: bool
    parent_id: int | None
    favorite: bool
    access: str
    created_at: datetime
    last_opened: datetime | None


class WorkspaceItemCreate(BaseModel):
    name: str
    is_folder: bool = False
    parent_id: int | None = None


class WorkspaceItemResponse(WorkspaceItemBase):
    owner_display_name: str | None = None

    class Config:
        from_attributes = True
