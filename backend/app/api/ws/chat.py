import json
import uuid

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

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
):
    await ws.accept()

    # First message must be auth: {"type": "auth", "data": {"token": "..."}}
    try:
        first_msg = await ws.receive_json()
        if first_msg.get("type") != "auth":
            await ws.close(code=4401, reason="First message must be auth")
            return
        token = first_msg.get("data", {}).get("token", "")
    except Exception:
        await ws.close(code=4400, reason="Invalid auth message")
        return

    # Verify visitor token
    async with async_session_factory() as db:
        repo = SessionRepository(db)
        session = await repo.get_by_visitor_token(token)
        if not session or session.id != session_id:
            await ws.send_json({"type": "error", "data": {"message": "Forbidden"}})
            await ws.close(code=4403, reason="Forbidden")
            return

    # Auth OK — register connection
    manager.visitor_connections[session_id] = ws
    logger.info("ws_visitor_connected", session_id=str(session_id))
    await ws.send_json({"type": "auth_ok", "data": {}})

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                continue  # ignore malformed JSON
            msg_type = data.get("type")

            # Heartbeat: respond to ping with pong
            if msg_type == "ping":
                await ws.send_json({"type": "pong", "data": {}})
                continue

            if msg_type == "message":
                content = data.get("data", {}).get("content", "").strip()
                if not content or len(content) > 5000:
                    continue

                async with async_session_factory() as db:
                    svc = MessageService(db)
                    try:
                        message, _ = await svc.send_message(session_id, content, "visitor")
                    except Exception as e:
                        detail = e.detail if hasattr(e, "detail") else str(e)
                        await ws.send_json({"type": "error", "data": {"message": str(detail)}})
                        continue
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
                    try:
                        parsed_ids = [uuid.UUID(mid) for mid in message_ids[:500]]
                    except ValueError:
                        continue
                    async with async_session_factory() as db:
                        svc = MessageService(db)
                        await svc.mark_as_read(session_id, parsed_ids)
                        await db.commit()

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_visitor_error", session_id=str(session_id))
    finally:
        manager.disconnect_visitor(session_id)
