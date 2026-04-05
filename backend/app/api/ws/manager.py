import uuid

import structlog
from fastapi import WebSocket

logger = structlog.get_logger()

# Redis pub/sub channels
CHANNEL_SESSION = "ws:session:{session_id}"
CHANNEL_ADMIN = "ws:admin"

# Heartbeat interval in seconds (client should ping at this rate)
HEARTBEAT_INTERVAL = 30


class ConnectionManager:
    """Manages WebSocket connections with Redis pub/sub for scalability."""

    def __init__(self):
        self.visitor_connections: dict[uuid.UUID, WebSocket] = {}
        self.agent_connections: dict[uuid.UUID, WebSocket] = {}

    async def connect_visitor(self, session_id: uuid.UUID, ws: WebSocket) -> None:
        await ws.accept()
        self.visitor_connections[session_id] = ws
        logger.info("ws_visitor_connected", session_id=str(session_id))

    async def connect_agent(self, agent_id: uuid.UUID, ws: WebSocket) -> None:
        await ws.accept()
        self.agent_connections[agent_id] = ws
        logger.info("ws_agent_connected", agent_id=str(agent_id))

    def disconnect_visitor(self, session_id: uuid.UUID) -> None:
        self.visitor_connections.pop(session_id, None)
        logger.info("ws_visitor_disconnected", session_id=str(session_id))

    def disconnect_agent(self, agent_id: uuid.UUID) -> None:
        self.agent_connections.pop(agent_id, None)
        logger.info("ws_agent_disconnected", agent_id=str(agent_id))

    async def send_to_visitor(self, session_id: uuid.UUID, event: dict) -> None:
        """Send event to a specific visitor by session_id."""
        ws = self.visitor_connections.get(session_id)
        if ws:
            try:
                await ws.send_json(event)
            except Exception:
                self.disconnect_visitor(session_id)

    async def send_to_agents(self, event: dict) -> None:
        """Send event to all connected agents."""
        dead = []
        for agent_id, ws in self.agent_connections.items():
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(agent_id)
        for agent_id in dead:
            self.disconnect_agent(agent_id)


manager = ConnectionManager()
