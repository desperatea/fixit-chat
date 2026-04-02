from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WidgetSettings(Base):
    __tablename__ = "widget_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    primary_color: Mapped[str] = mapped_column(String(7), default="#1976D2", nullable=False)
    header_title: Mapped[str] = mapped_column(String(100), default="Техподдержка", nullable=False)
    welcome_message: Mapped[str] = mapped_column(
        Text, default="Здравствуйте! Опишите вашу проблему...", nullable=False
    )
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    close_message: Mapped[str] = mapped_column(
        Text, default="Сессия завершена. Спасибо за обращение!", nullable=False
    )
    auto_close_minutes: Mapped[int] = mapped_column(Integer, default=1440, nullable=False)
    telegram_bot_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    allowed_file_types: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        default=["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx"],
        nullable=False,
    )
    max_file_size_mb: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    privacy_policy_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    form_fields: Mapped[list | None] = mapped_column(
        JSONB,
        default=[
            {"name": "visitor_name", "label": "Имя", "type": "text", "required": True},
            {"name": "visitor_phone", "label": "Телефон", "type": "tel", "required": False},
            {"name": "visitor_org", "label": "Организация", "type": "text", "required": False},
            {"name": "initial_message", "label": "Сообщение", "type": "textarea", "required": True},
        ],
        nullable=False,
    )
    allowed_origins: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=["https://fixitmail.ru"], nullable=False
    )
    admin_ip_whitelist: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=[], nullable=False
    )
    smartcaptcha_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_widget_settings_singleton"),
    )
