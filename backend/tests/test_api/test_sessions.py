"""Tests for admin session API endpoints."""
import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.agent import Agent


class TestAdminSessions:
    def _auth_cookies(self, test_agent: Agent) -> dict:
        """Create access_token cookie for test agent."""
        token = create_access_token(test_agent.id)
        return {"access_token": token}

    async def _create_session_via_widget(self, client: AsyncClient) -> dict:
        resp = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Тест Клиент",
            "visitor_phone": "+78634441160",
            "initial_message": "Нужна помощь",
            "consent_given": True,
        })
        return resp.json()

    async def test_list_sessions(self, client: AsyncClient, test_agent: Agent):
        await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        response = await client.get("/api/v1/admin/sessions", cookies=cookies)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    async def test_list_sessions_filter_status(self, client: AsyncClient, test_agent: Agent):
        await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        response = await client.get("/api/v1/admin/sessions?status=open", cookies=cookies)
        assert response.status_code == 200
        assert all(s["status"] == "open" for s in response.json()["items"])

    async def test_list_sessions_unauthorized(self, client: AsyncClient, clean_db):
        response = await client.get("/api/v1/admin/sessions")
        assert response.status_code in (401, 403)

    async def test_get_session(self, client: AsyncClient, test_agent: Agent):
        session = await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        response = await client.get(
            f"/api/v1/admin/sessions/{session['id']}", cookies=cookies,
        )
        assert response.status_code == 200
        assert response.json()["visitor_name"] == "Тест Клиент"

    async def test_close_session_via_admin(self, client: AsyncClient, test_agent: Agent):
        session = await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        response = await client.patch(
            f"/api/v1/admin/sessions/{session['id']}",
            json={"status": "closed"},
            cookies=cookies,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "closed"

    async def test_reopen_session(self, client: AsyncClient, test_agent: Agent):
        session = await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        # Close first
        await client.patch(
            f"/api/v1/admin/sessions/{session['id']}",
            json={"status": "closed"},
            cookies=cookies,
        )

        # Reopen
        response = await client.patch(
            f"/api/v1/admin/sessions/{session['id']}",
            json={"status": "open"},
            cookies=cookies,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "open"

    async def test_send_agent_message(self, client: AsyncClient, test_agent: Agent):
        session = await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        response = await client.post(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            json={"content": "Здравствуйте, чем могу помочь?"},
            cookies=cookies,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "Здравствуйте, чем могу помочь?"
        assert data["sender_type"] == "agent"
        assert data["sender_id"] == str(test_agent.id)

    async def test_send_agent_message_reopens_closed_session(self, client: AsyncClient, test_agent: Agent):
        session = await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        # Close session
        await client.patch(
            f"/api/v1/admin/sessions/{session['id']}",
            json={"status": "closed"},
            cookies=cookies,
        )

        # Send message to closed session — should auto-reopen
        response = await client.post(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            json={"content": "Дополнительная информация"},
            cookies=cookies,
        )
        assert response.status_code == 201

        # Verify session is open again
        session_resp = await client.get(
            f"/api/v1/admin/sessions/{session['id']}", cookies=cookies,
        )
        assert session_resp.json()["status"] == "open"

    async def test_get_session_messages(self, client: AsyncClient, test_agent: Agent):
        session = await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        # Send an agent message
        await client.post(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            json={"content": "Ответ агента"},
            cookies=cookies,
        )

        response = await client.get(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            cookies=cookies,
        )
        assert response.status_code == 200
        messages = response.json()
        assert len(messages) >= 2  # initial + agent
        sender_types = [m["sender_type"] for m in messages]
        assert "visitor" in sender_types
        assert "agent" in sender_types

    async def test_mark_messages_read(self, client: AsyncClient, test_agent: Agent):
        session = await self._create_session_via_widget(client)
        cookies = self._auth_cookies(test_agent)

        # Get messages to find IDs
        msgs_resp = await client.get(
            f"/api/v1/admin/sessions/{session['id']}/messages",
            cookies=cookies,
        )
        message_ids = [m["id"] for m in msgs_resp.json()]

        # Mark as read
        response = await client.post(
            f"/api/v1/admin/sessions/{session['id']}/read",
            json={"message_ids": message_ids},
            cookies=cookies,
        )
        assert response.status_code == 204
