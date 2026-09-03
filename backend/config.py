import re
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ORIGIN_SPLIT = re.compile(r"[\s,;|]+")


def parse_frontend_urls(value: str) -> list[str]:
    """Split FRONTEND_URL into origin list (comma, space, or | separated)."""
    urls: list[str] = []
    seen: set[str] = set()
    for part in _ORIGIN_SPLIT.split(value or ""):
        origin = part.strip().rstrip("/")
        if origin.startswith(("http://", "https://")) and origin not in seen:
            seen.add(origin)
            urls.append(origin)
    return urls

# Resolve env files relative to this file so it works when running from project root or backend/
_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_FILES = (
    str(_BACKEND_DIR / ".env.development"),
    str(_BACKEND_DIR / ".env"),
)

# Groq retired these IDs on 2026-08-16; remap stale GROQ_MODEL env values.
RETIRED_GROQ_MODELS = {
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
    "llama-3.1-8b-instant": "openai/gpt-oss-20b",
    "qwen/qwen3-32b": "openai/gpt-oss-120b",
    "meta-llama/llama-4-scout-17b-16e-instruct": "openai/gpt-oss-120b",
    "meta-llama/llama-4-maverick-17b-128e-instruct": "openai/gpt-oss-120b",
}


class Settings(BaseSettings):
    """All values come from env (e.g. .env). Only variable names are used in code."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        extra="ignore",
    )

    database_url: str = Field(default="", validation_alias="DATABASE_URL")
    secret_key: str = Field(default="", validation_alias="SECRET_KEY")
    algorithm: str = Field(default="", validation_alias="ALGORITHM")
    access_token_expire_minutes: int = Field(default=0, validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    google_client_id: str = Field(default="", validation_alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", validation_alias="GOOGLE_CLIENT_SECRET")
    frontend_url: str = Field(default="", validation_alias="FRONTEND_URL")

    @field_validator("frontend_url", mode="before")
    @classmethod
    def _normalize_frontend_url(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        urls = parse_frontend_urls(value)
        return urls[0] if urls else value.strip().rstrip("/")

    # MongoDB (optional, for document storage / analytics, etc.)
    mongo_url: str = Field(default="", validation_alias="MONGO_URL")
    mongo_db_name: str = Field(default="", validation_alias="MONGO_DB_NAME")

    # Serper.dev Google Search API
    serper_api_key: str = Field(default="", validation_alias="SERPER_API_KEY")

    # Groq (structured-data cleanup and in-app AI; https://console.groq.com/)
    groq_api_key: str = Field(default="", validation_alias="GROQ_API_KEY")
    groq_model: str = Field(default="openai/gpt-oss-120b", validation_alias="GROQ_MODEL")

    @field_validator("groq_model", mode="before")
    @classmethod
    def _remap_retired_groq_model(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return RETIRED_GROQ_MODELS.get(value.strip(), value)

    # Firecrawl web scraping API (get key at https://firecrawl.dev/)
    firecrawl_api_key: str = Field(default="", validation_alias="FIRECRAWL_API_KEY")
    # Overlapping extract POSTs. Lower this if logs show 429 Too Many Requests.
    firecrawl_max_concurrency: int = Field(
        default=4, ge=1, le=8, validation_alias="FIRECRAWL_MAX_CONCURRENCY"
    )
    # How many sheet rows to Google-search in parallel (scrapes use Firecrawl concurrency).
    research_row_concurrency: int = Field(
        default=6, ge=1, le=10, validation_alias="RESEARCH_ROW_CONCURRENCY"
    )

    # Optional email delivery for OTP / verification codes
    smtp_host: str = Field(default="", validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_username: str = Field(default="", validation_alias="SMTP_USERNAME")
    smtp_password: str = Field(default="", validation_alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="", validation_alias="SMTP_FROM")
    smtp_use_tls: bool = Field(default=True, validation_alias="SMTP_USE_TLS")

    # Development helper: include OTP in API response (do NOT enable in production)
    dev_return_otp: bool = Field(default=False, validation_alias="DEV_RETURN_OTP")


@lru_cache
def get_settings() -> Settings:
    return Settings()
