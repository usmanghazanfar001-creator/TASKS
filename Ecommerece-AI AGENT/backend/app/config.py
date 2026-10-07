"""
Central application configuration.

All settings are read from environment variables (via a .env file in
development). Nothing here should be hardcoded per-environment - swap
DATABASE_URL to point at Postgres in production, etc.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_NAME: str = "AI E-commerce Assistant"
    ENV: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./ecommerce_ai.db"

    # Auth
    SECRET_KEY: str = "insecure-dev-key-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # LLM
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Optional: creates this admin account on startup if it does not exist yet
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    # CORS
    FRONTEND_ORIGIN: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
