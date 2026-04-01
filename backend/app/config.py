from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str = "postgresql+asyncpg://fixit:password@localhost/fixit_chat"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Security
    secret_key: str = "change-me"
    encryption_key: str = ""  # 32 bytes base64

    # JWT
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Yandex SmartCaptcha
    smartcaptcha_key: str = ""

    # File uploads
    upload_dir: str = "/app/uploads"
    max_file_size_mb: int = 10

    # Rate limiting
    rate_limit_per_minute: int = 100
    login_rate_limit_per_minute: int = 10

    # Brute force
    max_login_attempts: int = 5
    login_block_minutes: int = 15

    # Auto-close
    auto_close_minutes: int = 1440  # 24 hours


settings = Settings()
