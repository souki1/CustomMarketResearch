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


@lru_cache
def get_settings() -> Settings:
    return Settings()
