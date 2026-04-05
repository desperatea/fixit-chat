import hmac
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.session import ChatSession
from app.repositories.message_repo import MessageRepository
from app.repositories.rating_repo import RatingRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.settings_repo import SettingsRepository
from app.schemas.session import RatingResponse, SessionCreate, SessionResponse
from app.services.encryption_service import EncryptionService


class SessionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.session_repo = SessionRepository(db)
        self.rating_repo = RatingRepository(db)
        self.message_repo = MessageRepository(db)
        self.encryption = EncryptionService()

    def _to_dto(self, session: ChatSession) -> SessionResponse:
        """Convert ORM session to response DTO with decrypted fields."""
        ratings = [
            RatingResponse.model_validate(r) for r in session.ratings
        ] if session.ratings else []
        return SessionResponse(
            id=session.id,
            visitor_name=decrypt(session.visitor_name) if session.visitor_name else "",
            visitor_phone=decrypt(session.visitor_phone) if session.visitor_phone else None,
            visitor_org=decrypt(session.visitor_org) if session.visitor_org else None,
            initial_message=decrypt(session.initial_message) if session.initial_message else "",
            status=session.status,
            ratings=ratings,
            latest_rating=ratings[-1].rating if ratings else None,
            consent_given=session.consent_given,
            custom_fields=session.custom_fields,
            closed_at=session.closed_at,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )

    def _to_dto_list(self, sessions: list[ChatSession]) -> list[SessionResponse]:
        return [self._to_dto(s) for s in sessions]

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

    async def get_session(self, session_id: uuid.UUID) -> SessionResponse:
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        return self._to_dto(session)

    async def get_session_by_token(self, visitor_token: str) -> SessionResponse:
        session = await self.session_repo.get_by_visitor_token(visitor_token)
        if not session:
            raise NotFoundError("Сессия не найдена")
        return self._to_dto(session)

    async def verify_visitor_access(self, session_id: uuid.UUID, visitor_token: str) -> None:
        """Validate visitor token. Raises ForbiddenError/NotFoundError on failure."""
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        if not hmac.compare_digest(session.visitor_token, visitor_token):
            raise ForbiddenError("Нет доступа к этой сессии")

    async def get_list(
        self,
        *,
        status: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[SessionResponse], int]:
        if search:
            # Search requires decryption — load all, decrypt, filter in Python
            all_sessions = await self.session_repo.get_all_for_search(status=status)
            all_dtos = self._to_dto_list(all_sessions)

            query = search.lower()
            filtered = [
                s for s in all_dtos
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
        return self._to_dto_list(sessions), total

    async def close_session(self, session_id: uuid.UUID) -> SessionResponse:
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
            session, status="closed", closed_at=datetime.now(UTC),
        )
        # Re-fetch with ratings eagerly loaded
        session = await self.session_repo.get_by_id(session_id)
        return self._to_dto(session)

    async def reopen_session(self, session_id: uuid.UUID) -> SessionResponse:
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        if session.status == "open":
            raise BadRequestError("Сессия уже открыта")

        await self.session_repo.update(session, status="open", closed_at=None)
        session = await self.session_repo.get_by_id(session_id)
        return self._to_dto(session)

    async def rate_session(self, session_id: uuid.UUID, rating: int):
        """Create a new rating entry for the session. Returns the created rating."""
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")

        rating_entry = await self.rating_repo.create(
            session_id=session_id, rating=rating,
        )
        await self.db.refresh(rating_entry)
        return rating_entry

    async def update_visitor_phone(self, session_id: uuid.UUID, phone: str) -> None:
        """Update visitor phone (encrypted)."""
        from app.core.encryption import encrypt
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")
        encrypted = encrypt(phone) if phone else ""
        await self.session_repo.update(session, visitor_phone=encrypted)

    async def get_unread_count(self, session_id: uuid.UUID) -> int:
        return await self.session_repo.get_unread_count(session_id)
