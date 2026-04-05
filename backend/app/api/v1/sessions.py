import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_agent, get_db
from app.api.ws.manager import manager
from app.models.agent import Agent
from app.schemas.message import MessageCreate, MessageResponse, ReadMessagesRequest
from app.schemas.session import SessionListResponse, SessionResponse, SessionUpdate
from app.services.message_service import MessageService
from app.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["admin-sessions"])


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    status: str | None = Query(None, pattern="^(open|closed)$"),
    search: str | None = Query(None, max_length=100),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    sessions, total = await service.get_list(
        status=status, search=search, offset=offset, limit=limit,
    )
    for s in sessions:
        s.unread_count = await service.get_unread_count(s.id)

    return SessionListResponse(items=sessions, total=total, offset=offset, limit=limit)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    session = await service.get_session(session_id)
    session.unread_count = await service.get_unread_count(session_id)
    return session


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: uuid.UUID,
    data: SessionUpdate,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    if data.status == "closed":
        session = await service.close_session(session_id)
        await db.commit()
        await manager.send_to_visitor(session_id, {
            "type": "session_closed",
            "data": {"session_id": str(session_id)},
        })
    elif data.status == "open":
        session = await service.reopen_session(session_id)
        await db.commit()
        reopen_event = {
            "type": "session_reopened",
            "data": {"session_id": str(session_id)},
        }
        await manager.send_to_visitor(session_id, reopen_event)
        await manager.send_to_agents(reopen_event)
    else:
        session = await service.get_session(session_id)
    return session


@router.get("/{session_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    session_id: uuid.UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    msg_service = MessageService(db)
    return await msg_service.get_messages(session_id, offset=offset, limit=limit)


@router.post("/{session_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    session_id: uuid.UUID,
    data: MessageCreate,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    msg_service = MessageService(db)
    message, reopened = await msg_service.send_message(
        session_id, data.content, "agent", sender_id=agent.id, allow_reopen=True,
    )

    await db.commit()

    if reopened:
        reopen_event = {
            "type": "session_reopened",
            "data": {"session_id": str(session_id)},
        }
        await manager.send_to_visitor(session_id, reopen_event)
        await manager.send_to_agents(reopen_event)

    # Notify visitor via WebSocket
    await manager.send_to_visitor(session_id, {
        "type": "message",
        "data": {
            "id": str(message.id),
            "content": data.content,
            "sender_type": "agent",
            "sender_id": str(agent.id),
            "created_at": str(message.created_at),
        },
    })

    return message


@router.post("/{session_id}/read", status_code=204)
async def mark_read(
    session_id: uuid.UUID,
    data: ReadMessagesRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    msg_service = MessageService(db)
    await msg_service.mark_as_read(session_id, data.message_ids)
