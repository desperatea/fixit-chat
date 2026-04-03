from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ChatSession(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "chat_sessions"

    visitor_name: Mapped[str] = mapped_column(Text, nullable=False)  # encrypted AES-256
    visitor_phone: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted
    visitor_org: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted
    initial_message: Mapped[str] = mapped_column(Text, nullable=False)
    visitor_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    custom_fields: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
    notes = relationship("SessionNote", back_populates="session", cascade="all, delete-orphan")
    ratings = relationship("SessionRating", back_populates="session", cascade="all, delete-orphan", order_by="SessionRating.created_at")

    __table_args__ = (
        Index("idx_sessions_status", "status", postgresql_where=text("deleted_at IS NULL")),
        Index("idx_sessions_created", text("created_at DESC")),
    )
