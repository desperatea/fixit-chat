import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.message import Message
from app.repositories.base import BaseRepository


class MessageRepository(BaseRepository[Message]):
    def __init__(self, session: AsyncSession):
        super().__init__(Message, session)

    async def get_by_session(
        self,
        session_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> list[Message]:
        stmt = (
            select(Message)
            .options(selectinload(Message.attachments))
            .where(Message.session_id == session_id)
            .order_by(Message.created_at)
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def mark_as_read(
        self,
        session_id: uuid.UUID,
        message_ids: list[uuid.UUID],
    ) -> int:
        """Mark messages as read. Returns count of updated rows."""
        now = datetime.now(timezone.utc)
        stmt = (
            update(Message)
            .where(
                Message.session_id == session_id,
                Message.id.in_(message_ids),
                Message.is_read.is_(False),
            )
            .values(is_read=True, read_at=now)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount

    async def count_unread_by_session(self, session_id: uuid.UUID) -> int:
        from sqlalchemy import func

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
