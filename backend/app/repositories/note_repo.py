import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.note import SessionNote
from app.repositories.base import BaseRepository


class NoteRepository(BaseRepository[SessionNote]):
    def __init__(self, session: AsyncSession):
        super().__init__(SessionNote, session)

    async def get_by_session(self, session_id: uuid.UUID) -> list[SessionNote]:
        stmt = (
            select(SessionNote)
            .options(selectinload(SessionNote.agent))
            .where(SessionNote.session_id == session_id)
            .order_by(SessionNote.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
