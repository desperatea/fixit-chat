import uuid
from collections.abc import AsyncGenerator

import redis.asyncio as redis
from fastapi import Cookie, Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import UnauthorizedError
from app.core.redis import get_redis
from app.core.security import decode_token
from app.models.agent import Agent
from app.repositories.agent_repo import AgentRepository

security_scheme = HTTPBearer()


async def get_session(db: AsyncSession = Depends(get_db)) -> AsyncGenerator[AsyncSession, None]:
    yield db


async def get_redis_client() -> redis.Redis:
    return get_redis()


async def get_current_agent(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> Agent:
    token = credentials.credentials
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
