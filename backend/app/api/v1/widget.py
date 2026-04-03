import uuid

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.ws.manager import manager
from app.core.exceptions import ForbiddenError
from app.repositories.settings_repo import SettingsRepository
from app.schemas.message import MessageCreate, MessageResponse, ReadMessagesRequest
from app.schemas.session import RatingCreate, RatingResponse, SessionCreate, SessionCreateResponse, SessionResponse
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


def _build_session_response(session, unread: int = 0) -> SessionResponse:
    """Build SessionResponse with ratings from a decrypted session."""
    resp = SessionResponse.model_validate(session)
    resp.unread_count = unread
    if session.ratings:
        resp.ratings = [RatingResponse.model_validate(r) for r in session.ratings]
        resp.latest_rating = session.ratings[-1].rating
    return resp


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    x_visitor_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    session = await service.verify_visitor_access(session_id, x_visitor_token)
    unread = await service.get_unread_count(session_id)
    return _build_session_response(session, unread)


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
    unread = await session_service.get_unread_count(session_id)

    # Notify agents
    reopen_event = {
        "type": "session_reopened",
        "data": {"session_id": str(session_id)},
    }
    await manager.send_to_agents(reopen_event)

    return _build_session_response(session, unread)
