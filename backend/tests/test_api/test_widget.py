"""Tests for widget public API endpoints."""
import uuid

import pytest
from httpx import AsyncClient

from app.models.session import ChatSession


class TestWidgetSettings:
    async def test_get_settings(self, client: AsyncClient, clean_db, db_session):
        # Create settings through the same db_session used by client
        from app.models.settings import WidgetSettings
        settings_obj = WidgetSettings()
        db_session.add(settings_obj)
        await db_session.commit()

        response = await client.get("/api/v1/widget/settings")
        assert response.status_code == 200

        data = response.json()
        assert "primary_color" in data
        assert "header_title" in data
        assert "form_fields" in data
        assert "welcome_message" in data


class TestCreateSession:
    async def test_create_session(self, client: AsyncClient, clean_db):
        response = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Тест Пользователь",
            "visitor_phone": "+78634441160",
            "visitor_org": "ООО Тест",
            "initial_message": "Нужна помощь с настройкой",
            "consent_given": True,
        })
        assert response.status_code == 201

        data = response.json()
        assert "id" in data
        assert "visitor_token" in data
        assert data["status"] == "open"

    async def test_create_session_minimal(self, client: AsyncClient, clean_db):
        response = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Аноним",
            "initial_message": "Вопрос",
            "consent_given": True,
        })
        assert response.status_code == 201

    async def test_create_session_without_consent(self, client: AsyncClient, clean_db):
        response = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Тест",
            "initial_message": "Помогите",
            "consent_given": False,
        })
        assert response.status_code == 400

    async def test_create_session_empty_name(self, client: AsyncClient, clean_db):
        response = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "",
            "initial_message": "Помогите",
            "consent_given": True,
        })
        assert response.status_code == 422

    async def test_create_session_empty_message(self, client: AsyncClient, clean_db):
        response = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Тест",
            "initial_message": "",
            "consent_given": True,
        })
        assert response.status_code == 422


class TestGetSession:
    async def _create_session(self, client: AsyncClient) -> dict:
        resp = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Иван",
            "visitor_phone": "+78634441160",
            "initial_message": "Помогите",
            "consent_given": True,
        })
        return resp.json()

    async def test_get_session_with_valid_token(self, client: AsyncClient, clean_db):
        created = await self._create_session(client)

        response = await client.get(
            f"/api/v1/widget/sessions/{created['id']}",
            headers={"X-Visitor-Token": created["visitor_token"]},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["visitor_name"] == "Иван"
        assert data["visitor_phone"] == "+78634441160"

    async def test_get_session_with_invalid_token(self, client: AsyncClient, clean_db):
        created = await self._create_session(client)

        response = await client.get(
            f"/api/v1/widget/sessions/{created['id']}",
            headers={"X-Visitor-Token": "wrong_token"},
        )
        assert response.status_code == 403

    async def test_get_session_without_token(self, client: AsyncClient, clean_db):
        created = await self._create_session(client)

        response = await client.get(f"/api/v1/widget/sessions/{created['id']}")
        assert response.status_code == 422  # Missing required header

    async def test_get_nonexistent_session(self, client: AsyncClient, clean_db):
        response = await client.get(
            f"/api/v1/widget/sessions/{uuid.uuid4()}",
            headers={"X-Visitor-Token": "any"},
        )
        assert response.status_code == 404


class TestSendMessage:
    async def _create_session(self, client: AsyncClient) -> dict:
        resp = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Иван",
            "initial_message": "Начальное сообщение",
            "consent_given": True,
        })
        return resp.json()

    async def test_send_message(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/messages",
            json={"content": "Второе сообщение"},
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "Второе сообщение"
        assert data["sender_type"] == "visitor"

    async def test_send_message_invalid_token(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/messages",
            json={"content": "Сообщение"},
            headers={"X-Visitor-Token": "wrong"},
        )
        assert response.status_code == 403

    async def test_send_empty_message(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/messages",
            json={"content": ""},
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 422

    async def test_get_messages(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        # Send additional message
        await client.post(
            f"/api/v1/widget/sessions/{session['id']}/messages",
            json={"content": "Второе сообщение"},
            headers={"X-Visitor-Token": session["visitor_token"]},
        )

        response = await client.get(
            f"/api/v1/widget/sessions/{session['id']}/messages",
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 200
        messages = response.json()
        assert len(messages) >= 2  # initial + sent


class TestCloseSession:
    async def _create_session(self, client: AsyncClient) -> dict:
        resp = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Иван",
            "initial_message": "Вопрос",
            "consent_given": True,
        })
        return resp.json()

    async def test_close_session(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/close",
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "closed"

    async def test_send_message_to_closed_session(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        # Close
        await client.post(
            f"/api/v1/widget/sessions/{session['id']}/close",
            headers={"X-Visitor-Token": session["visitor_token"]},
        )

        # Try to send
        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/messages",
            json={"content": "Ещё сообщение"},
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 403


class TestRating:
    async def _create_session(self, client: AsyncClient) -> dict:
        resp = await client.post("/api/v1/widget/sessions", json={
            "visitor_name": "Иван",
            "initial_message": "Вопрос",
            "consent_given": True,
        })
        return resp.json()

    async def test_rate_session(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/rating",
            json={"rating": 5},
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 200
        assert response.json()["rating"] == 5

    async def test_rate_session_invalid_rating(self, client: AsyncClient, clean_db):
        session = await self._create_session(client)

        # Rating 0 (too low)
        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/rating",
            json={"rating": 0},
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 422

        # Rating 6 (too high)
        response = await client.post(
            f"/api/v1/widget/sessions/{session['id']}/rating",
            json={"rating": 6},
            headers={"X-Visitor-Token": session["visitor_token"]},
        )
        assert response.status_code == 422
