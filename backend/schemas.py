from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Literal

from security.password_policy import MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, validate_password


class SignUpBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
    display_name: str | None = Field(default=None, max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("password")
    @classmethod
    def _password_policy(cls, value: str, info):
        email = None
        if info.data:
            email = info.data.get("email")
        err = validate_password(value, email if isinstance(email, str) else None)
        if err:
            raise ValueError(err)
        return value


class SignInBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=MAX_PASSWORD_LENGTH)

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class MfaSignInBody(BaseModel):
    mfa_token: str = Field(..., min_length=10, max_length=4096)
    code: str = Field(..., min_length=6, max_length=16)


class RefreshTokenBody(BaseModel):
    refresh_token: str = Field(..., min_length=10, max_length=4096)


class GoogleExchangeBody(BaseModel):
    code: str = Field(..., min_length=16, max_length=256)


class TokenResponse(BaseModel):
    access_token: str = ""
    token_type: str = "bearer"
    display_name: str = ""
    refresh_token: str | None = None
    expires_in: int | None = None
    mfa_required: bool = False
    mfa_token: str | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    phone: str | None = None
    job_title: str | None = None
    profile_photo_url: str | None = None
    totp_enabled: bool = False
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class UpdateProfileBody(BaseModel):
    display_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=255)


class PasswordChangeRequestBody(BaseModel):
    channel: Literal["email", "sms"] = "email"


class PasswordChangeRequestResponse(BaseModel):
    detail: str
    delivery: str | None = None
    dev_code: str | None = None


class PasswordChangeConfirmBody(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)
    new_password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        err = validate_password(value)
        if err:
            raise ValueError(err)
        return value


class PasswordChangeConfirmResponse(BaseModel):
    detail: str


class MfaSetupResponse(BaseModel):
    otpauth_url: str
    qr_data_uri: str
    secret: str


class MfaConfirmBody(BaseModel):
    code: str = Field(..., min_length=6, max_length=16)


class MfaDisableBody(BaseModel):
    code: str = Field(..., min_length=6, max_length=16)


class MfaBackupCodesResponse(BaseModel):
    backup_codes: list[str]
    detail: str


class SessionResponse(BaseModel):
    id: int
    current: bool
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    ip_address: str | None = None
    user_agent: str | None = None


class LogoutBody(BaseModel):
    refresh_token: str | None = None


class DeleteAccountBody(BaseModel):
    email: EmailStr
    password: str | None = None
    totp_code: str | None = Field(default=None, max_length=16)


class MessageResponse(BaseModel):
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
    name: str = Field(..., min_length=1, max_length=255)
    is_folder: bool = False
    parent_id: int | None = None


class WorkspaceItemMove(BaseModel):
    parent_id: int | None = None


class WorkspaceItemResponse(WorkspaceItemBase):
    owner_display_name: str | None = None
    report_id: int | None = None

    class Config:
        from_attributes = True


class DataSheetSelectionCreate(BaseModel):
    """Payload to store selected table headers and row data in MongoDB."""

    headers: list[str] = Field(..., max_length=200)
    rows: list[list[str]] = Field(..., max_length=5000)
    row_indices: list[int] | None = Field(default=None, max_length=5000)
    sheet_name: str | None = Field(default=None, max_length=255)
    file_id: int | None = None
    tab_id: str | None = Field(default=None, max_length=128)


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

    ai_query: str | None = Field(default=None, max_length=4000)
    zip_code: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=300)


class ResearchTransferRowMap(BaseModel):
    source_table_row_index: int = Field(..., ge=0)
    dest_table_row_index: int = Field(..., ge=0)


class ResearchTransferRequest(BaseModel):
    """Move or duplicate research results when sheet rows are transferred."""

    mode: Literal["move", "duplicate"]
    source_file_id: int | None = None
    source_tab_id: str | None = None
    dest_file_id: int | None = None
    dest_tab_id: str | None = None
    row_map: list[ResearchTransferRowMap] = Field(default_factory=list, max_length=500)


class ResearchTransferResponse(BaseModel):
    mode: Literal["move", "duplicate"]
    rows_matched: int
    research_docs_touched: int
    scraped_docs_copied: int = 0


class ResearchMoreSourceBody(BaseModel):
    """Re-scrape one existing source URL with a custom extraction prompt."""

    scraped_id: int
    ai_query: str


class ResearchFieldChange(BaseModel):
    field: str
    before: Any | None = None
    after: Any | None = None
    kind: Literal["updated", "added"] = "updated"


class ResearchChangeLogEntry(BaseModel):
    at: str
    changes: list[ResearchFieldChange] = Field(default_factory=list)


class ResearchMoreSourceResponse(BaseModel):
    research_url_id: int
    scraped_id: int
    url: str
    data: dict
    updated_fields: list[str] = []
    new_fields: list[str] = []
    field_changes: list[ResearchFieldChange] = Field(default_factory=list)
    change_log: list[ResearchChangeLogEntry] = Field(default_factory=list)


class PortfolioItemResponse(BaseModel):
    part_number: str | None = None
    vendor_name: str | None = None
    price: str | None = None
    quantity: int | None = None
    url: str | None = None
    image_url: str | None = None
    row_index: int | None = None


class PortfolioSummaryResponse(BaseModel):
    """Aggregates for the merged portfolio (all selections), computed server-side."""

    unique_parts: int = 0
    offer_count: int = 0
    best_price: float | None = None
    average_price: float | None = None
    prices_included: int = 0


class PortfolioExcludeRequest(BaseModel):
    part_number: str
    """When True, hide every offer for this part number."""
    exclude_entire_part: bool = False
    vendor_name: str | None = None
    url: str | None = None
    price: str | None = None
    quantity: int | None = None


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
    compare_tabs: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    active_compare_tab_id: str | None = Field(default=None, max_length=128)
    compare_mode: Literal["same-part", "different-same-vendor", "different-different-vendors"] = "different-different-vendors"
    scraped_vendor_filter: str = Field(default="all", max_length=200)
    scraped_view_mode: Literal["row", "column"] = "row"
    scraped_selected_fields: list[str] = Field(default_factory=list, max_length=200)
    scraped_value_search: str = Field(default="", max_length=500)
    scraped_non_empty_only: bool = False
    scraped_data_by_part: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    scraped_data: list[dict[str, Any]] = Field(default_factory=list, max_length=2000)


class CompareStateResponse(CompareStateUpsert):
    owner_id: int
    created_at: datetime
    updated_at: datetime


class ResearchStateUpsert(BaseModel):
    """Cross-browser Research page session (file-backed open tabs + UI chrome)."""

    open_tabs: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    active_file_id: int | None = None
    page_state: dict[str, Any] = Field(default_factory=dict)


class ResearchStateResponse(ResearchStateUpsert):
    owner_id: int
    created_at: datetime
    updated_at: datetime


class ResearchJobResponse(BaseModel):
    """Cross-browser research run status for the same user."""

    id: int
    status: Literal["running", "done", "failed"]
    selection_id: int | None = None
    file_id: int | None = None
    tab_id: str | None = None
    table_row_indices: list[int] = Field(default_factory=list)
    completed_rows: int = 0
    total_rows: int = 0
    total_urls: int = 0
    error: str | None = None
    started_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class ReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    blocks: list[dict[str, Any]] = Field(default_factory=list, max_length=500)


class ReportUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    blocks: list[dict[str, Any]] | None = Field(default=None, max_length=500)


class ReportResponse(BaseModel):
    id: int
    owner_id: int
    title: str
    blocks: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    workspace_parent_id: int | None = None
    source_workspace_file_id: int | None = None
    source_workspace_pdf_id: int | None = None  # legacy


# ---------------------------------------------------------------------------
# Purchase orders
# ---------------------------------------------------------------------------

POStatusLiteral = Literal["draft", "submitted", "approved", "sent", "partial", "closed"]


class PurchaseOrderLinePayload(BaseModel):
    id: str = Field(..., min_length=1, max_length=80)
    sku: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=8000)
    qty: int = Field(default=1, ge=0, le=1_000_000_000)
    uom: str = Field(default="ea", max_length=32)
    unit_price: float = Field(default=0, ge=0, le=1e15)
    vendor_url: str = Field(default="", max_length=2000, description="Source / product page URL for the line")


class PurchaseOrderCreate(BaseModel):
    number: str = Field(..., min_length=1, max_length=120)
    vendor_name: str = Field(default="", max_length=500)
    vendor_email: str = Field(default="", max_length=500)
    issue_date: str = Field(default="", max_length=32)
    required_by: str = Field(default="", max_length=32)
    status: POStatusLiteral = "draft"
    ship_to: str = Field(default="", max_length=8000)
    payment_terms: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=8000)
    lines: list[PurchaseOrderLinePayload] = Field(default_factory=list, max_length=500)
    source_selection_id: int | None = None


class PurchaseOrderUpdate(BaseModel):
    number: str | None = Field(default=None, max_length=120)
    vendor_name: str | None = Field(default=None, max_length=500)
    vendor_email: str | None = Field(default=None, max_length=500)
    issue_date: str | None = Field(default=None, max_length=32)
    required_by: str | None = Field(default=None, max_length=32)
    status: POStatusLiteral | None = None
    ship_to: str | None = Field(default=None, max_length=8000)
    payment_terms: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=8000)
    lines: list[PurchaseOrderLinePayload] | None = Field(default=None, max_length=500)
    source_selection_id: int | None = None


class PurchaseOrderResponse(BaseModel):
    id: int
    owner_id: int
    number: str
    vendor_name: str
    vendor_email: str
    issue_date: str
    required_by: str
    status: POStatusLiteral
    ship_to: str
    payment_terms: str
    notes: str
    lines: list[PurchaseOrderLinePayload]
    source_selection_id: int | None = None
    created_at: datetime
    updated_at: datetime
