import hmac
import uuid
from datetime import datetime, timezone

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import make_transient

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.session import ChatSession
from app.repositories.message_repo import MessageRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.settings_repo import SettingsRepository
from app.schemas.session import SessionCreate
from app.services.encryption_service import EncryptionService


class SessionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.session_repo = SessionRepository(db)
        self.message_repo = MessageRepository(db)
        self.encryption = EncryptionService()

    def _decrypt_and_detach(self, session: ChatSession) -> ChatSession:
        """Load all columns, detach from DB session, then decrypt."""
        # Force load all column attributes to avoid DetachedInstanceError
        inspect(session)  # ensures state is loaded
        for col in session.__table__.columns:
            getattr(session, col.key, None)
        self.db.expunge(session)
        make_transient(session)
        self.encryption.decrypt_session(session)
        return session

    def _decrypt_and_detach_list(self, sessions: list[ChatSession]) -> list[ChatSession]:
        for s in sessions:
            self._decrypt_and_detach(s)
        return sessions

    async def create_session(self, data: SessionCreate) -> ChatSession:
        if not data.consent_given:
            raise BadRequestError("Необходимо согласие на обработку персональных данных")

        visitor_token = uuid.uuid4().hex

        encrypted = self.encryption.encrypt_session_data({
            "visitor_name": data.visitor_name,
            "visitor_phone": data.visitor_phone,
            "visitor_org": data.visitor_org,
            "initial_message": data.initial_message,
        })

        session = await self.session_repo.create(
            visitor_name=encrypted["visitor_name"],
            visitor_phone=encrypted.get("visitor_phone"),
            visitor_org=encrypted.get("visitor_org"),
            initial_message=encrypted["initial_message"],
            visitor_token=visitor_token,
            consent_given=data.consent_given,
            custom_fields=data.custom_fields or {},
        )

        # Create the initial message
        await self.message_repo.create(
            session_id=session.id,
            sender_type="visitor",
            content=encrypted["initial_message"],
        )

        return session

    async def get_session(self, session_id: uuid.UUID) -> ChatSession:
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        return self._decrypt_and_detach(session)

    async def get_session_by_token(self, visitor_token: str) -> ChatSession:
        session = await self.session_repo.get_by_visitor_token(visitor_token)
        if not session:
            raise NotFoundError("Сессия не найдена")
        return self._decrypt_and_detach(session)

    async def verify_visitor_access(self, session_id: uuid.UUID, visitor_token: str) -> ChatSession:
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        if not hmac.compare_digest(session.visitor_token, visitor_token):
            raise ForbiddenError("Нет доступа к этой сессии")
        return self._decrypt_and_detach(session)

    async def get_list(
        self,
        *,
        status: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[ChatSession], int]:
        if search:
            # Search requires decryption — load all, decrypt, filter in Python
            all_sessions = await self.session_repo.get_all_for_search(status=status)
            self._decrypt_and_detach_list(all_sessions)

            query = search.lower()
            filtered = [
                s for s in all_sessions
                if query in (s.visitor_name or "").lower()
                or query in (s.visitor_phone or "").lower()
                or query in (s.visitor_org or "").lower()
            ]
            total = len(filtered)
            page = filtered[offset:offset + limit]
            return page, total

        sessions, total = await self.session_repo.get_list(
            status=status, offset=offset, limit=limit,
        )
        self._decrypt_and_detach_list(sessions)
        return sessions, total

    async def close_session(self, session_id: uuid.UUID) -> ChatSession:
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        if session.status == "closed":
            raise BadRequestError("Сессия уже закрыта")

        # Get close message from settings
        settings_repo = SettingsRepository(self.db)
        settings = await settings_repo.get()
        close_text = settings.close_message or "Сессия завершена."

        # Add system message
        encrypted = self.encryption.encrypt_message_content(close_text)
        await self.message_repo.create(
            session_id=session_id,
            sender_type="system",
            content=encrypted,
        )

        await self.session_repo.update(
            session, status="closed", closed_at=datetime.now(timezone.utc),
        )
        await self.db.refresh(session)
        return self._decrypt_and_detach(session)

    async def reopen_session(self, session_id: uuid.UUID) -> ChatSession:
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        if session.status == "open":
            raise BadRequestError("Сессия уже открыта")

        await self.session_repo.update(session, status="open", closed_at=None)
        await self.db.refresh(session)
        return self._decrypt_and_detach(session)

    async def rate_session(self, session_id: uuid.UUID, rating: int) -> ChatSession:
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")

        await self.session_repo.update(session, rating=rating)
        await self.db.refresh(session)
        return self._decrypt_and_detach(session)

    async def get_unread_count(self, session_id: uuid.UUID) -> int:
        return await self.session_repo.get_unread_count(session_id)
