from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve env files relative to this file so it works when running from project root or backend/
_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_FILES = (
    str(_BACKEND_DIR / ".env.development"),
    str(_BACKEND_DIR / ".env"),
)


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

    # MongoDB (optional, for document storage / analytics, etc.)
    mongo_url: str = Field(default="", validation_alias="MONGO_URL")
    mongo_db_name: str = Field(default="", validation_alias="MONGO_DB_NAME")

    # Serper.dev Google Search API
    serper_api_key: str = Field(default="", validation_alias="SERPER_API_KEY")

    # Groq / Llama 3.3 70B (cleans structured data; free: 1k req/day, 12k TPM; https://console.groq.com/)
    groq_api_key: str = Field(default="", validation_alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.3-70b-versatile", validation_alias="GROQ_MODEL")

    # Firecrawl web scraping API (get key at https://firecrawl.dev/)
    firecrawl_api_key: str = Field(default="", validation_alias="FIRECRAWL_API_KEY")

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
