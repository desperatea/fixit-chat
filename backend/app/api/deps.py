import uuid
from collections.abc import AsyncGenerator

import redis.asyncio as redis
from fastapi import Cookie, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import UnauthorizedError
from app.core.redis import get_redis
from app.core.security import decode_token
from app.models.agent import Agent
from app.repositories.agent_repo import AgentRepository


async def get_session(db: AsyncSession = Depends(get_db)) -> AsyncGenerator[AsyncSession, None]:
    yield db


async def get_redis_client() -> redis.Redis:
    return get_redis()


async def get_current_agent(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Agent:
    # Get access token from httpOnly cookie
    token = request.cookies.get("access_token")
    if not token:
        raise UnauthorizedError("Не авторизован")

    payload = decode_token(token)

    if payload is None or payload.get("type") != "access":
        raise UnauthorizedError("Невалидный access токен")

    agent_id = uuid.UUID(payload["sub"])
    repo = AgentRepository(db)
    agent = await repo.get_by_id(agent_id)

    if not agent or not agent.is_active:
        raise UnauthorizedError("Агент не найден или деактивирован")

    return agent


async def get_visitor_token(
    x_visitor_token: str = Header(..., alias="X-Visitor-Token"),
) -> str:
    return x_visitor_token
