"""Tests for health check and basic endpoints."""
from httpx import AsyncClient


class TestHealth:
    async def test_health_check(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
