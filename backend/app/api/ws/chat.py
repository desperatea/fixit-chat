import uuid

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.api.ws.manager import manager
from app.core.database import async_session_factory
from app.repositories.session_repo import SessionRepository
from app.services.message_service import MessageService

logger = structlog.get_logger()

router = APIRouter()


@router.websocket("/ws/chat/{session_id}")
async def visitor_ws(
    ws: WebSocket,
    session_id: uuid.UUID,
    token: str = Query(...),
):
    # Verify visitor token
    async with async_session_factory() as db:
        repo = SessionRepository(db)
        session = await repo.get_by_visitor_token(token)
        if not session or session.id != session_id:
            await ws.close(code=4403, reason="Forbidden")
            return

    await manager.connect_visitor(session_id, ws)

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "message":
                content = data.get("data", {}).get("content", "").strip()
                if not content:
                    continue

                async with async_session_factory() as db:
                    svc = MessageService(db)
                    message = await svc.send_message(session_id, content, "visitor")
                    await db.commit()

                event = {
                    "type": "new_message",
                    "data": {
                        "session_id": str(session_id),
                        "id": str(message.id),
                        "content": content,
                        "sender_type": "visitor",
                        "sender_id": None,
                        "created_at": str(message.created_at),
                    },
                }
                await manager.send_to_agents(event)

            elif msg_type == "typing":
                await manager.send_to_agents({
                    "type": "typing",
                    "data": {"session_id": str(session_id), "sender_type": "visitor"},
                })

            elif msg_type == "read":
                message_ids = data.get("data", {}).get("message_ids", [])
                if message_ids:
                    async with async_session_factory() as db:
                        svc = MessageService(db)
                        await svc.mark_as_read(
                            session_id, [uuid.UUID(mid) for mid in message_ids],
                        )
                        await db.commit()

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_visitor_error", session_id=str(session_id))
    finally:
        manager.disconnect_visitor(session_id)
