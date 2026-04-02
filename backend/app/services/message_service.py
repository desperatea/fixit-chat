import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import make_transient

from app.core.exceptions import ForbiddenError, NotFoundError
from app.repositories.message_repo import MessageRepository
from app.repositories.session_repo import SessionRepository
from app.services.encryption_service import EncryptionService


class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.message_repo = MessageRepository(db)
        self.session_repo = SessionRepository(db)
        self.encryption = EncryptionService()

    async def send_message(
        self,
        session_id: uuid.UUID,
        content: str,
        sender_type: str,
        sender_id: uuid.UUID | None = None,
        *,
        allow_reopen: bool = False,
    ) -> tuple:
        """Send a message. Returns (message, reopened: bool).

        If session is closed:
        - allow_reopen=True + sender_type="agent" → auto-reopen session
        - otherwise → ForbiddenError
        """
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise NotFoundError("Сессия не найдена")

        reopened = False
        if session.status == "closed":
            if allow_reopen and sender_type == "agent":
                await self.session_repo.update(session, status="open", closed_at=None)
                reopened = True
            else:
                raise ForbiddenError("Сессия закрыта")

        encrypted_content = self.encryption.encrypt_message_content(content)

        message = await self.message_repo.create(
            session_id=session_id,
            sender_type=sender_type,
            sender_id=sender_id,
            content=encrypted_content,
        )

        # Detach and set decrypted content for response
        for col in message.__table__.columns:
            getattr(message, col.key, None)
        self.db.expunge(message)
        make_transient(message)
        message.content = content
        return message, reopened

    async def get_messages(
        self,
        session_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ):
        messages = await self.message_repo.get_by_session(
            session_id, offset=offset, limit=limit,
        )
        for msg in messages:
            for col in msg.__table__.columns:
                getattr(msg, col.key, None)
            self.db.expunge(msg)
            make_transient(msg)
            msg.content = self.encryption.decrypt_message_content(msg.content)
        return messages

    async def mark_as_read(
        self,
        session_id: uuid.UUID,
        message_ids: list[uuid.UUID],
    ) -> int:
        return await self.message_repo.mark_as_read(session_id, message_ids)
