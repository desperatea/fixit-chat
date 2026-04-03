import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rating import SessionRating
from app.repositories.base import BaseRepository


class RatingRepository(BaseRepository[SessionRating]):
    def __init__(self, session: AsyncSession):
        super().__init__(SessionRating, session)

    async def get_by_session(self, session_id: uuid.UUID) -> list[SessionRating]:
        stmt = (
            select(SessionRating)
            .where(SessionRating.session_id == session_id)
            .order_by(SessionRating.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
