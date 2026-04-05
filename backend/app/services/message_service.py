import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.message import Message
from app.repositories.message_repo import MessageRepository
from app.repositories.session_repo import SessionRepository
from app.schemas.attachment import AttachmentResponse
from app.schemas.message import MessageResponse
from app.services.encryption_service import EncryptionService


class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.message_repo = MessageRepository(db)
        self.session_repo = SessionRepository(db)
        self.encryption = EncryptionService()

    @staticmethod
    def _to_dto(
        message: Message,
        decrypted_content: str | None = None,
        *,
        attachments_loaded: bool = True,
    ) -> MessageResponse:
        """Convert ORM message to response DTO.

        Set attachments_loaded=False for freshly created messages where the
        relationship hasn't been eagerly loaded (avoids lazy-load in async).
        """
        content = decrypted_content if decrypted_content is not None else decrypt(message.content)
        attachments = (
            [AttachmentResponse.model_validate(a) for a in message.attachments]
            if attachments_loaded and message.attachments else []
        )
        return MessageResponse(
            id=message.id,
            session_id=message.session_id,
            sender_type=message.sender_type,
            sender_id=message.sender_id,
            content=content,
            is_read=message.is_read,
            read_at=message.read_at,
            created_at=message.created_at,
            attachments=attachments,
        )

    async def send_message(
        self,
        session_id: uuid.UUID,
        content: str,
        sender_type: str,
        sender_id: uuid.UUID | None = None,
        *,
        allow_reopen: bool = False,
    ) -> tuple[MessageResponse, bool]:
        """Send a message. Returns (MessageResponse, reopened: bool).

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

        return self._to_dto(message, decrypted_content=content, attachments_loaded=False), reopened

    async def get_messages(
        self,
        session_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> list[MessageResponse]:
        messages = await self.message_repo.get_by_session(
            session_id, offset=offset, limit=limit,
        )
        return [self._to_dto(msg) for msg in messages]

    async def mark_as_read(
        self,
        session_id: uuid.UUID,
        message_ids: list[uuid.UUID],
    ) -> int:
        return await self.message_repo.mark_as_read(session_id, message_ids)
