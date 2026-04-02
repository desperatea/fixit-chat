"""Tests for SessionService."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.session import ChatSession
from app.schemas.session import SessionCreate
from app.services.session_service import SessionService


class TestSessionService:
    async def test_create_session(self, db_session: AsyncSession, clean_db):
        service = SessionService(db_session)
        data = SessionCreate(
            visitor_name="Тест Пользователь",
            visitor_phone="+78634441160",
            visitor_org="ООО Тест",
            initial_message="Нужна помощь",
            consent_given=True,
        )
        session = await service.create_session(data)

        assert session.id is not None
        assert session.visitor_token is not None
        assert len(session.visitor_token) == 32
        assert session.status == "open"
        assert session.consent_given is True

    async def test_create_session_without_consent_fails(self, db_session: AsyncSession, clean_db):
        service = SessionService(db_session)
        data = SessionCreate(
            visitor_name="Тест",
            initial_message="Помогите",
            consent_given=False,
        )
        with pytest.raises(BadRequestError):
            await service.create_session(data)

    async def test_create_session_optional_fields(self, db_session: AsyncSession, clean_db):
        service = SessionService(db_session)
        data = SessionCreate(
            visitor_name="Аноним",
            initial_message="Вопрос",
            consent_given=True,
        )
        session = await service.create_session(data)
        assert session.id is not None

    async def test_get_session(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        session = await service.get_session(test_session.id)

        assert session.id == test_session.id
        # Should be decrypted
        assert session.visitor_name == "Иван Петров"

    async def test_get_session_not_found(self, db_session: AsyncSession, clean_db):
        service = SessionService(db_session)
        with pytest.raises(NotFoundError):
            await service.get_session(uuid.uuid4())

    async def test_verify_visitor_access_valid(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        session = await service.verify_visitor_access(
            test_session.id, test_session.visitor_token,
        )
        assert session.visitor_name == "Иван Петров"

    async def test_verify_visitor_access_invalid_token(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        with pytest.raises(ForbiddenError):
            await service.verify_visitor_access(test_session.id, "wrong_token")

    async def test_close_session(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        closed = await service.close_session(test_session.id)

        assert closed.status == "closed"
        assert closed.closed_at is not None

    async def test_close_already_closed_session(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        await service.close_session(test_session.id)

        with pytest.raises(BadRequestError):
            await service.close_session(test_session.id)

    async def test_rate_session(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        rated = await service.rate_session(test_session.id, 5)
        assert rated.rating == 5

    async def test_rate_session_boundary_values(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        # Rating 1
        rated = await service.rate_session(test_session.id, 1)
        assert rated.rating == 1
        # Rating 5
        rated = await service.rate_session(test_session.id, 5)
        assert rated.rating == 5
