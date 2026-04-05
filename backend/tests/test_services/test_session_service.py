"""Tests for SessionService."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.session import ChatSession
from app.models.settings import WidgetSettings
from app.schemas.session import SessionCreate
from app.services.session_service import SessionService


async def _ensure_settings(db_session: AsyncSession):
    """Ensure widget_settings exists (needed by close_session)."""
    from app.repositories.settings_repo import SettingsRepository
    repo = SettingsRepository(db_session)
    try:
        await repo.get()
    except Exception:
        db_session.add(WidgetSettings())
        await db_session.commit()


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
        # get_session now returns SessionResponse DTO
        session = await service.get_session(test_session.id)

        assert session.id == test_session.id
        assert session.visitor_name == "Иван Петров"

    async def test_get_session_not_found(self, db_session: AsyncSession, clean_db):
        service = SessionService(db_session)
        with pytest.raises(NotFoundError):
            await service.get_session(uuid.uuid4())

    async def test_verify_visitor_access_valid(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        # verify_visitor_access now returns None (just validates)
        await service.verify_visitor_access(
            test_session.id, test_session.visitor_token,
        )

    async def test_verify_visitor_access_invalid_token(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        with pytest.raises(ForbiddenError):
            await service.verify_visitor_access(test_session.id, "wrong_token")

    async def test_close_session(self, db_session: AsyncSession, test_session: ChatSession):
        await _ensure_settings(db_session)
        service = SessionService(db_session)
        closed = await service.close_session(test_session.id)

        assert closed.status == "closed"
        assert closed.closed_at is not None

    async def test_close_already_closed_session(self, db_session: AsyncSession, test_session: ChatSession):
        await _ensure_settings(db_session)
        service = SessionService(db_session)
        await service.close_session(test_session.id)

        with pytest.raises(BadRequestError):
            await service.close_session(test_session.id)

    async def test_reopen_session(self, db_session: AsyncSession, test_session: ChatSession):
        await _ensure_settings(db_session)
        service = SessionService(db_session)
        await service.close_session(test_session.id)

        reopened = await service.reopen_session(test_session.id)
        assert reopened.status == "open"
        assert reopened.closed_at is None

    async def test_reopen_already_open_session(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        with pytest.raises(BadRequestError):
            await service.reopen_session(test_session.id)

    async def test_rate_session(self, db_session: AsyncSession, test_session: ChatSession):
        service = SessionService(db_session)
        rating_entry = await service.rate_session(test_session.id, 5)
        assert rating_entry.rating == 5
        assert rating_entry.session_id == test_session.id

    async def test_multiple_ratings(self, db_session: AsyncSession, test_session: ChatSession):
        """Close → rate → reopen → close → rate — both ratings preserved."""
        await _ensure_settings(db_session)
        service = SessionService(db_session)

        # First cycle: close and rate
        await service.close_session(test_session.id)
        r1 = await service.rate_session(test_session.id, 4)

        # Reopen
        await service.reopen_session(test_session.id)

        # Second cycle: close and rate
        await service.close_session(test_session.id)
        r2 = await service.rate_session(test_session.id, 5)

        assert r1.rating == 4
        assert r2.rating == 5
        assert r1.id != r2.id

        # Session should have both ratings (now returns SessionResponse DTO)
        session = await service.get_session(test_session.id)
        assert len(session.ratings) == 2
        assert session.ratings[0].rating == 4
        assert session.ratings[1].rating == 5
