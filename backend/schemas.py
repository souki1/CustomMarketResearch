from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field
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


class WorkspaceItemMove(BaseModel):
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


class ResearchSearchBody(BaseModel):
    """Optional body for search endpoint to enable scraping."""

    ai_query: str | None = None


class PortfolioItemResponse(BaseModel):
    part_number: str | None = None
    vendor_name: str | None = None
    price: str | None = None
    quantity: int | None = None
    url: str | None = None
    image_url: str | None = None


class PortfolioSummaryResponse(BaseModel):
    """Aggregates for the merged portfolio (all selections), computed server-side."""

    unique_parts: int = 0
    offer_count: int = 0
    best_price: float | None = None
    average_price: float | None = None
    prices_included: int = 0


class AiChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AiChatRequest(BaseModel):
    """Groq-backed assistant; `mode` selects system prompt / behavior."""

    mode: Literal["chat", "summarize", "rewrite", "brainstorm", "report"] = "chat"
    message: str = Field(..., min_length=1, max_length=48_000)
    history: list[AiChatHistoryMessage] = Field(default_factory=list, max_length=32)
    session_id: str | None = Field(
        default=None,
        max_length=64,
        description="Continue a chat thread; omit to start a new conversation (server assigns session_id).",
    )
    context: str | None = Field(
        default=None,
        max_length=50_000,
        description="Optional grounding text (e.g. JSON of sheet row + scraped structured data). Chat mode only.",
    )
    session_label: str | None = Field(
        default=None,
        max_length=200,
        description="Short label for chat history (e.g. Research · part number). Stored on each MongoDB turn.",
    )
    source: str | None = Field(
        default=None,
        max_length=32,
        description="Origin tag for analytics / UI (e.g. research_inspector).",
    )


class AiChatResponse(BaseModel):
    content: str
    model: str
    session_id: str = Field(
        ...,
        description="MongoDB session key for this thread (new UUID if you did not pass session_id).",
    )


class AiSessionSummary(BaseModel):
    """Grouped AI interactions in MongoDB collection `ai_interactions`."""

    session_id: str
    mode: str
    preview: str
    last_at: datetime
    turn_count: int
    session_label: str | None = None
    source: str | None = None


class AiSessionMessagesResponse(BaseModel):
    session_id: str
    mode: str
    messages: list[AiChatHistoryMessage]


class CompareStateUpsert(BaseModel):
    compare_tabs: list[dict[str, Any]] = Field(default_factory=list)
    active_compare_tab_id: str | None = None
    compare_mode: Literal["same-part", "different-same-vendor", "different-different-vendors"] = "different-different-vendors"
    scraped_vendor_filter: str = "all"
    scraped_view_mode: Literal["row", "column"] = "row"
    scraped_selected_fields: list[str] = Field(default_factory=list)
    scraped_value_search: str = ""
    scraped_non_empty_only: bool = False
    scraped_data_by_part: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    scraped_data: list[dict[str, Any]] = Field(default_factory=list)


class CompareStateResponse(CompareStateUpsert):
    owner_id: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class ReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    blocks: list[dict[str, Any]] = Field(default_factory=list)


class ReportUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    blocks: list[dict[str, Any]] | None = None


class ReportResponse(BaseModel):
    id: int
    owner_id: int
    title: str
    blocks: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime
