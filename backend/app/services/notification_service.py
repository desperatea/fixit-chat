import html

import structlog
from httpx import AsyncClient

from app.config import settings

logger = structlog.get_logger()


class NotificationService:
    """Sends Telegram notifications about new sessions."""

    @staticmethod
    async def notify_new_session(visitor_name: str, message: str) -> None:
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return

        safe_name = html.escape(visitor_name)
        safe_message = html.escape(message[:200])
        text = (
            f"💬 Новое обращение в чат\n\n"
            f"👤 {safe_name}\n"
            f"📝 {safe_message}"
        )

        try:
            async with AsyncClient() as client:
                await client.post(
                    f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                    json={
                        "chat_id": settings.telegram_chat_id,
                        "text": text,
                        "parse_mode": "HTML",
                    },
                    timeout=5,
                )
        except Exception:
            logger.warning("telegram_notification_failed", exc_info=True)

    @staticmethod
    async def notify_session_rated(visitor_name: str, rating: int) -> None:
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return

        stars = "⭐" * rating
        safe_name = html.escape(visitor_name)
        text = f"📊 Оценка сессии: {stars}\n👤 {safe_name}"

        try:
            async with AsyncClient() as client:
                await client.post(
                    f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                    json={
                        "chat_id": settings.telegram_chat_id,
                        "text": text,
                    },
                    timeout=5,
                )
        except Exception:
            logger.warning("telegram_notification_failed", exc_info=True)
