from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.message import Message
from app.models.session import ChatSession
from app.repositories.base import SoftDeleteRepository


class SessionRepository(SoftDeleteRepository[ChatSession]):
    def __init__(self, session: AsyncSession):
        super().__init__(ChatSession, session)

    async def get_by_id_with_messages(self, session_id) -> ChatSession | None:
        stmt = (
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == session_id, ChatSession.deleted_at.is_(None))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_visitor_token(self, token: str) -> ChatSession | None:
        stmt = select(ChatSession).where(
            ChatSession.visitor_token == token,
            ChatSession.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_list(
        self,
        *,
        status: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[ChatSession], int]:
        """Return paginated sessions with total count."""
        base = select(ChatSession).where(ChatSession.deleted_at.is_(None))
        count_stmt = select(func.count()).select_from(ChatSession).where(ChatSession.deleted_at.is_(None))

        if status:
            base = base.where(ChatSession.status == status)
            count_stmt = count_stmt.where(ChatSession.status == status)

        if search:
            pattern = f"%{search}%"
            search_filter = ChatSession.visitor_name.ilike(pattern)
            base = base.where(search_filter)
            count_stmt = count_stmt.where(search_filter)

        total = (await self.session.execute(count_stmt)).scalar_one()

        stmt = base.order_by(ChatSession.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        sessions = list(result.scalars().all())

        return sessions, total

    async def get_open_inactive_since(self, since: datetime) -> list[ChatSession]:
        """Get open sessions with no messages after `since`."""
        latest_msg = (
            select(func.max(Message.created_at))
            .where(Message.session_id == ChatSession.id)
            .correlate(ChatSession)
            .scalar_subquery()
        )
        stmt = select(ChatSession).where(
            ChatSession.status == "open",
            ChatSession.deleted_at.is_(None),
            func.coalesce(latest_msg, ChatSession.created_at) < since,
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_status(self) -> dict[str, int]:
        stmt = (
            select(ChatSession.status, func.count())
            .where(ChatSession.deleted_at.is_(None))
            .group_by(ChatSession.status)
        )
        result = await self.session.execute(stmt)
        return dict(result.all())

    async def get_unread_count(self, session_id) -> int:
        stmt = (
            select(func.count())
            .select_from(Message)
            .where(
                Message.session_id == session_id,
                Message.sender_type == "visitor",
                Message.is_read.is_(False),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()
