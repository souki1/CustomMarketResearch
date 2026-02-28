"""Application configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """App settings loaded from environment."""

    app_name: str = "InteligentResearch API"
    debug: bool = False

    class Config:
        env_prefix = "APP_"
        env_file = ".env"


settings = Settings()
