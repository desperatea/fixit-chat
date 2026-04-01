import uuid
from abc import ABC, abstractmethod

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.agent import Agent
from app.repositories.agent_repo import AgentRepository


class AuthProvider(ABC):
    @abstractmethod
    async def authenticate(self, username: str, password: str) -> Agent:
        ...

    @abstractmethod
    async def validate_token(self, token: str) -> dict:
        ...


class JWTAuthProvider(AuthProvider):
    def __init__(self, db: AsyncSession, redis_client: redis.Redis):
        self.db = db
        self.redis = redis_client
        self.agent_repo = AgentRepository(db)

    async def authenticate(self, username: str, password: str) -> Agent:
        agent = await self.agent_repo.get_by_username(username)
        if not agent or not verify_password(password, agent.password_hash):
            raise UnauthorizedError("Неверный логин или пароль")
        if not agent.is_active:
            raise UnauthorizedError("Аккаунт деактивирован")
        return agent

    async def validate_token(self, token: str) -> dict:
        payload = decode_token(token)
        if payload is None:
            raise UnauthorizedError("Невалидный токен")
        return payload

    async def create_tokens(self, agent: Agent) -> tuple[str, str]:
        access = create_access_token(agent.id)
        refresh = create_refresh_token(agent.id)

        # Store refresh token in Redis
        refresh_key = f"refresh:{agent.id}:{refresh[-16:]}"
        await self.redis.setex(
            refresh_key,
            settings.refresh_token_expire_days * 86400,
            str(agent.id),
        )

        await self.agent_repo.update_last_seen(agent)
        return access, refresh

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, str]:
        payload = decode_token(refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise UnauthorizedError("Невалидный refresh токен")

        agent_id = uuid.UUID(payload["sub"])

        # Verify refresh token exists in Redis
        refresh_key = f"refresh:{agent_id}:{refresh_token[-16:]}"
        stored = await self.redis.get(refresh_key)
        if not stored:
            raise UnauthorizedError("Refresh токен отозван")

        # Revoke old refresh token
        await self.redis.delete(refresh_key)

        agent = await self.agent_repo.get_by_id(agent_id)
        if not agent or not agent.is_active:
            raise UnauthorizedError("Аккаунт не найден или деактивирован")

        return await self.create_tokens(agent)

    async def logout(self, agent_id: uuid.UUID, refresh_token: str | None = None) -> None:
        if refresh_token:
            refresh_key = f"refresh:{agent_id}:{refresh_token[-16:]}"
            await self.redis.delete(refresh_key)
        else:
            # Revoke all refresh tokens for this agent
            pattern = f"refresh:{agent_id}:*"
            async for key in self.redis.scan_iter(pattern):
                await self.redis.delete(key)

    @staticmethod
    def hash_password(password: str) -> str:
        return hash_password(password)
