import uuid

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.ws.manager import manager
from app.core.database import async_session_factory
from app.core.security import decode_token
from app.repositories.agent_repo import AgentRepository
from app.services.message_service import MessageService

logger = structlog.get_logger()

router = APIRouter()


@router.websocket("/ws/admin")
async def agent_ws(ws: WebSocket):
    # Get access token from cookie
    token = ws.cookies.get("access_token")
    if not token:
        await ws.close(code=4401, reason="Unauthorized")
        return

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await ws.close(code=4401, reason="Unauthorized")
        return

    agent_id = uuid.UUID(payload["sub"])

    async with async_session_factory() as db:
        repo = AgentRepository(db)
        agent = await repo.get_by_id(agent_id)
        if not agent or not agent.is_active:
            await ws.close(code=4401, reason="Unauthorized")
            return

    await manager.connect_agent(agent_id, ws)

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")
            target_session_id = data.get("data", {}).get("session_id")

            if not target_session_id:
                continue
            target_session_id = uuid.UUID(target_session_id)

            if msg_type == "message":
                content = data.get("data", {}).get("content", "").strip()
                if not content:
                    continue

                async with async_session_factory() as db:
                    svc = MessageService(db)
                    message, reopened = await svc.send_message(
                        target_session_id, content, "agent",
                        sender_id=agent_id, allow_reopen=True,
                    )
                    await db.commit()

                if reopened:
                    reopen_event = {
                        "type": "session_reopened",
                        "data": {"session_id": str(target_session_id)},
                    }
                    await manager.send_to_visitor(target_session_id, reopen_event)
                    await manager.send_to_agents(reopen_event)

                # Send to visitor
                await manager.send_to_visitor(target_session_id, {
                    "type": "message",
                    "data": {
                        "id": str(message.id),
                        "content": content,
                        "sender_type": "agent",
                        "sender_id": str(agent_id),
                        "created_at": str(message.created_at),
                    },
                })

            elif msg_type == "typing":
                await manager.send_to_visitor(target_session_id, {
                    "type": "typing",
                    "data": {"session_id": str(target_session_id), "sender_type": "agent"},
                })

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_agent_error", agent_id=str(agent_id))
    finally:
        manager.disconnect_agent(agent_id)

        async with async_session_factory() as db:
            repo = AgentRepository(db)
            agent = await repo.get_by_id(agent_id)
            if agent:
                await repo.update_last_seen(agent)
                await db.commit()
