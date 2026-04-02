from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WidgetSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    primary_color: str
    header_title: str
    welcome_message: str
    logo_url: str | None
    privacy_policy_url: str | None
    form_fields: list | None
    allowed_file_types: list[str]
    max_file_size_mb: int


class WidgetSettingsAdminResponse(WidgetSettingsResponse):
    """Full settings visible to admin."""

    close_message: str
    auto_close_minutes: int
    telegram_bot_token: str | None
    telegram_chat_id: str | None
    allowed_origins: list[str]
    admin_ip_whitelist: list[str]
    smartcaptcha_key: str | None
    updated_at: datetime


class WidgetSettingsUpdate(BaseModel):
    primary_color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    header_title: str | None = Field(None, max_length=100)
    welcome_message: str | None = None
    logo_url: str | None = None
    close_message: str | None = None
    auto_close_minutes: int | None = Field(None, ge=5)
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    allowed_file_types: list[str] | None = None
    max_file_size_mb: int | None = Field(None, ge=1, le=50)
    privacy_policy_url: str | None = None
    form_fields: list | None = None
    allowed_origins: list[str] | None = None
    admin_ip_whitelist: list[str] | None = None
    smartcaptcha_key: str | None = None
