"""Tests for admin session API endpoints."""
import pytest
from httpx import AsyncClient

from app.models.agent import Agent


class TestAdminSessions:
    async def _create_session_via_widget(self, client: AsyncClient) -> dict:
        resp = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Тест Клиент",
            "visitor_phone": "+78634441160",
            "initial_message": "Нужна помощь",
            "consent_given": True,
        })
        return resp.json()

    async def test_list_sessions(self, client: AsyncClient, test_agent: Agent, auth_token: str):
        # Create a session first
        await self._create_session_via_widget(client)

        response = await client.get(
            "/api/v1/admin/sessions",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    async def test_list_sessions_filter_status(self, client: AsyncClient, test_agent: Agent, auth_token: str):
        session = await self._create_session_via_widget(client)

        # Filter open
        response = await client.get(
            "/api/v1/admin/sessions?status=open",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert all(s["status"] == "open" for s in response.json()["items"])

    async def test_list_sessions_unauthorized(self, client: AsyncClient, clean_db):
        response = await client.get("/api/v1/admin/sessions")
        assert response.status_code in (401, 403)

    async def test_get_session(self, client: AsyncClient, test_agent: Agent, auth_token: str):
        session = await self._create_session_via_widget(client)

        response = await client.get(
            f"/api/v1/admin/sessions/{session['id']}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["visitor_name"] == "Тест Клиент"

    async def test_close_session_via_admin(self, client: AsyncClient, test_agent: Agent, auth_token: str):
        session = await self._create_session_via_widget(client)

        response = await client.patch(
            f"/api/v1/admin/sessions/{session['id']}",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "closed"

    async def test_send_agent_message(self, client: AsyncClient, test_agent: Agent, auth_token: str):
        session = await self._create_session_via_widget(client)

        response = await client.post(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            json={"content": "Здравствуйте, чем могу помочь?"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "Здравствуйте, чем могу помочь?"
        assert data["sender_type"] == "agent"
        assert data["sender_id"] == str(test_agent.id)

    async def test_get_session_messages(self, client: AsyncClient, test_agent: Agent, auth_token: str):
        session = await self._create_session_via_widget(client)

        # Send an agent message
        await client.post(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            json={"content": "Ответ агента"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        response = await client.get(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        messages = response.json()
        assert len(messages) >= 2  # initial + agent
        sender_types = [m["sender_type"] for m in messages]
        assert "visitor" in sender_types
        assert "agent" in sender_types

    async def test_mark_messages_read(self, client: AsyncClient, test_agent: Agent, auth_token: str):
        session = await self._create_session_via_widget(client)

        # Get messages to find IDs
        msgs_resp = await client.get(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        message_ids = [m["id"] for m in msgs_resp.json()]

        # Mark as read
        response = await client.post(
            f"/api/v1/admin/sessions/{session['id']}/read",
            json={"message_ids": message_ids},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 204
