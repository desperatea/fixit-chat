"""Tests for authentication API endpoints."""
import pytest
from httpx import AsyncClient

from app.models.agent import Agent


class TestLogin:
    async def test_login_success(self, client: AsyncClient, test_agent: Agent):
        response = await client.post("/api/v1/admin/auth/login", json={
            "username": "testadmin",
            "password": "TestPass123",
        })
        assert response.status_code == 200

        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "refresh_token" in response.cookies

    async def test_login_wrong_password(self, client: AsyncClient, test_agent: Agent):
        response = await client.post("/api/v1/admin/auth/login", json={
            "username": "testadmin",
            "password": "wrongpassword",
        })
        assert response.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient, clean_db):
        response = await client.post("/api/v1/admin/auth/login", json={
            "username": "nobody",
            "password": "password",
        })
        assert response.status_code == 401

    async def test_login_inactive_agent(self, client: AsyncClient, inactive_agent: Agent):
        response = await client.post("/api/v1/admin/auth/login", json={
            "username": "inactive_user",
            "password": "TestPass123",
        })
        assert response.status_code == 401

    async def test_login_empty_fields(self, client: AsyncClient, clean_db):
        response = await client.post("/api/v1/admin/auth/login", json={
            "username": "",
            "password": "",
        })
        assert response.status_code in (401, 422)


class TestRefresh:
    async def test_refresh_success(self, client: AsyncClient, test_agent: Agent):
        # Login first
        login_resp = await client.post("/api/v1/admin/auth/login", json={
            "username": "testadmin",
            "password": "TestPass123",
        })
        assert login_resp.status_code == 200

        # Extract refresh cookie and pass it directly
        refresh_cookie = login_resp.cookies.get("refresh_token")
        assert refresh_cookie is not None

        # Refresh — set cookie on the client directly
        refresh_resp = await client.post(
            "/api/v1/admin/auth/refresh",
            cookies={"refresh_token": refresh_cookie},
        )
        assert refresh_resp.status_code == 200
        assert "access_token" in refresh_resp.json()

    async def test_refresh_without_cookie(self, client: AsyncClient):
        response = await client.post("/api/v1/admin/auth/refresh")
        assert response.status_code == 401


class TestLogout:
    async def test_logout_success(self, client: AsyncClient, test_agent: Agent):
        # Login
        login_resp = await client.post("/api/v1/admin/auth/login", json={
            "username": "testadmin",
            "password": "TestPass123",
        })
        token = login_resp.json()["access_token"]

        # Logout
        logout_resp = await client.post(
            "/api/v1/admin/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
            cookies=login_resp.cookies,
        )
        assert logout_resp.status_code == 204

    async def test_logout_without_token(self, client: AsyncClient):
        response = await client.post("/api/v1/admin/auth/logout")
        assert response.status_code in (401, 403)
