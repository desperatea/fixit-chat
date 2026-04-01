from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.repositories.base import BaseRepository


class AgentRepository(BaseRepository[Agent]):
    def __init__(self, session: AsyncSession):
        super().__init__(Agent, session)

    async def get_by_username(self, username: str) -> Agent | None:
        stmt = select(Agent).where(Agent.username == username)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active(self) -> list[Agent]:
        stmt = select(Agent).where(Agent.is_active.is_(True)).order_by(Agent.display_name)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_last_seen(self, agent: Agent) -> Agent:
        agent.last_seen_at = datetime.now(timezone.utc)
        await self.session.flush()
        return agent
