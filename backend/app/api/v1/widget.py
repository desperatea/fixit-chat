import uuid

from fastapi import APIRouter, Depends, File, Header, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.api.ws.manager import manager
from app.repositories.settings_repo import SettingsRepository
from app.schemas.message import MessageCreate, MessageResponse, ReadMessagesRequest
from app.schemas.session import (
    GlpiSessionCreate, RatingCreate, RatingResponse,
    SessionCreate, SessionCreateResponse, SessionResponse,
)
from app.core.exceptions import NotFoundError
from app.models.attachment import Attachment
from app.services.file_service import FileService
from app.services.glpi_service import verify_glpi_token
from app.schemas.settings import WidgetSettingsResponse
from app.services.message_service import MessageService
from app.services.notification_service import NotificationService
from app.services.session_service import SessionService

router = APIRouter(prefix="/widget", tags=["widget"])


@router.get("/settings", response_model=WidgetSettingsResponse)
async def get_widget_settings(db: AsyncSession = Depends(get_db)):
    repo = SettingsRepository(db)
    return await repo.get()


@router.post("/sessions", response_model=SessionCreateResponse, status_code=201)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    session = await service.create_session(data)

    await db.commit()

    # Notify agents about new session
    await manager.send_to_agents({
        "type": "new_session",
        "data": {
            "session_id": str(session.id),
            "visitor_name": data.visitor_name,
            "initial_message": data.initial_message,
            "created_at": str(session.created_at),
        },
    })

    # Telegram notification
    await NotificationService.notify_new_session(data.visitor_name, data.initial_message)

    return SessionCreateResponse(
        id=session.id,
        visitor_token=session.visitor_token,
        status=session.status,
        created_at=session.created_at,
    )


@router.post("/sessions/glpi", response_model=SessionCreateResponse, status_code=201)
async def create_glpi_session(
    data: GlpiSessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create or resume session for GLPI-authenticated user.

    If the user already has an open session — returns it (same session from any PC).
    Otherwise creates a new one.
    """
    glpi_user = verify_glpi_token(data.glpi_token)

    # Check for existing open session for this GLPI user
    from app.repositories.session_repo import SessionRepository
    repo = SessionRepository(db)
    existing = await repo.get_open_by_glpi_user(glpi_user.user_id)

    if existing:
        return SessionCreateResponse(
            id=existing.id,
            visitor_token=existing.visitor_token,
            status=existing.status,
            created_at=existing.created_at,
        )

    # No open session — create new one
    session_data = SessionCreate(
        visitor_name=glpi_user.name,
        visitor_phone=glpi_user.phone,
        visitor_org=glpi_user.org,
        initial_message=data.initial_message,
        consent_given=True,
        custom_fields={
            "glpi_user_id": glpi_user.user_id,
            "glpi_entity_id": glpi_user.entity_id or "",
        },
    )

    service = SessionService(db)
    session = await service.create_session(session_data)

    await db.commit()

    await manager.send_to_agents({
        "type": "new_session",
        "data": {
            "session_id": str(session.id),
            "visitor_name": glpi_user.name,
            "initial_message": data.initial_message,
            "created_at": str(session.created_at),
        },
    })

    await NotificationService.notify_new_session(
        glpi_user.name, data.initial_message,
    )

    return SessionCreateResponse(
        id=session.id,
        visitor_token=session.visitor_token,
        status=session.status,
        created_at=session.created_at,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    await service.verify_visitor_access(session_id, x_visitor_token)
    session = await service.get_session(session_id)
    session.unread_count = await service.get_unread_count(session_id)
    return session


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    session_id: uuid.UUID,
    x_visitor_token: str = Header(...),
    offset: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, x_visitor_token)

    msg_service = MessageService(db)
    return await msg_service.get_messages(session_id, offset=offset, limit=limit)


@router.post("/sessions/{session_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    session_id: uuid.UUID,
    data: MessageCreate,
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, x_visitor_token)

    msg_service = MessageService(db)
    message, _ = await msg_service.send_message(session_id, data.content, "visitor")

    await db.commit()

    # Notify agents via WebSocket
    await manager.send_to_agents({
        "type": "new_message",
        "data": {
            "session_id": str(session_id),
            "id": str(message.id),
            "content": data.content,
            "sender_type": "visitor",
            "sender_id": None,
            "created_at": str(message.created_at),
        },
    })

    return message


@router.post("/sessions/{session_id}/close", response_model=SessionResponse)
async def close_session(
    session_id: uuid.UUID,
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, x_visitor_token)

    session = await session_service.close_session(session_id)

    # Commit before WS notification so agents can fetch updated data immediately
    await db.commit()

    # Notify agents
    await manager.send_to_agents({
        "type": "session_closed",
        "data": {"session_id": str(session_id)},
    })

    return session


@router.post("/sessions/{session_id}/read", status_code=204)
async def mark_read(
    session_id: uuid.UUID,
    data: ReadMessagesRequest,
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, x_visitor_token)

    msg_service = MessageService(db)
    await msg_service.mark_as_read(session_id, data.message_ids)


@router.post("/sessions/{session_id}/rating", response_model=RatingResponse, status_code=201)
async def rate_session(
    session_id: uuid.UUID,
    data: RatingCreate,
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, x_visitor_token)

    rating_entry = await session_service.rate_session(session_id, data.rating)

    await db.commit()

    # Notify agents
    await manager.send_to_agents({
        "type": "session_rated",
        "data": {
            "session_id": str(session_id),
            "rating": data.rating,
            "rating_id": str(rating_entry.id),
            "created_at": str(rating_entry.created_at),
        },
    })

    return rating_entry


@router.post("/sessions/{session_id}/reopen", response_model=SessionResponse)
async def reopen_session(
    session_id: uuid.UUID,
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, x_visitor_token)

    session = await session_service.reopen_session(session_id)
    session.unread_count = await session_service.get_unread_count(session_id)

    await db.commit()

    # Notify agents
    reopen_event = {
        "type": "session_reopened",
        "data": {"session_id": str(session_id)},
    }
    await manager.send_to_agents(reopen_event)

    return session


@router.post("/sessions/{session_id}/files", response_model=MessageResponse, status_code=201)
async def upload_file(
    session_id: uuid.UUID,
    file: UploadFile = File(...),
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file from visitor. Creates a message with attachment."""
    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, x_visitor_token)

    # Get file settings from widget config
    settings_repo = SettingsRepository(db)
    widget_settings = await settings_repo.get()

    # Create message for the file
    msg_service = MessageService(db)
    message, _ = await msg_service.send_message(session_id, "(файл)", "visitor")

    # Upload and attach file
    file_svc = FileService(
        db,
        allowed_types=widget_settings.allowed_file_types,
        max_size_mb=widget_settings.max_file_size_mb,
    )
    attachment = await file_svc.upload(file, message.id)

    await db.commit()

    # Build response with attachment
    from app.schemas.attachment import AttachmentResponse
    att_resp = AttachmentResponse.model_validate(attachment)
    message.attachments = [att_resp]

    # Notify agents
    await manager.send_to_agents({
        "type": "new_message",
        "data": {
            "session_id": str(session_id),
            "id": str(message.id),
            "content": message.content,
            "sender_type": "visitor",
            "sender_id": None,
            "created_at": str(message.created_at),
            "attachments": [{
                "id": str(attachment.id),
                "file_name": attachment.file_name,
                "file_size": attachment.file_size,
                "mime_type": attachment.mime_type,
            }],
        },
    })

    return message


@router.get("/sessions/{session_id}/files/{attachment_id}")
async def download_file(
    session_id: uuid.UUID,
    attachment_id: uuid.UUID,
    token: str | None = Query(None),
    x_visitor_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Download a file. Token accepted via header or query param (for img src)."""
    visitor_token = x_visitor_token or token
    if not visitor_token:
        from app.core.exceptions import UnauthorizedError
        raise UnauthorizedError("Требуется токен доступа")

    session_service = SessionService(db)
    await session_service.verify_visitor_access(session_id, visitor_token)

    # Find attachment and verify it belongs to this session
    stmt = (
        select(Attachment)
        .options(selectinload(Attachment.message))
        .where(Attachment.id == attachment_id)
    )
    result = await db.execute(stmt)
    attachment = result.scalar_one_or_none()

    if not attachment or attachment.message.session_id != session_id:
        raise NotFoundError("Файл не найден")

    file_path = FileService.get_file_path(attachment)
    disposition = "inline" if attachment.mime_type.startswith("image/") else "attachment"

    from urllib.parse import quote
    encoded_name = quote(attachment.file_name)

    return FileResponse(
        path=file_path,
        media_type=attachment.mime_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{encoded_name}",
        },
    )
