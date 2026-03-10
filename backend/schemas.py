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


class DataSheetSelectionCreate(BaseModel):
    """Payload to store selected table headers and row data in MongoDB."""

    headers: list[str]
    rows: list[list[str]]
    row_indices: list[int] | None = None
    sheet_name: str | None = None
    file_id: int | None = None
    tab_id: str | None = None


class DataSheetSelectionResponse(BaseModel):
    id: int
    headers: list[str]
    rows: list[list[str]]
    sheet_name: str | None
    file_id: int | None
    tab_id: str | None
    created_at: datetime


class ResearchUrlItem(BaseModel):
    selection_id: int
    row_index: int
    search_query: str
    urls: list[str]
    headers: list[str]
    row_data: list[str]
    created_at: datetime


class ResearchSearchResponse(BaseModel):
    selection_id: int
    rows_searched: int
    total_urls: int
    research_url_ids: list[int]
