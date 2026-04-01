import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.database import async_session_factory
from app.repositories.settings_repo import SettingsRepository

logger = structlog.get_logger()

# Paths protected by IP whitelist
PROTECTED_PREFIXES = ("/api/v1/admin", "/docs", "/metrics")


class IPWhitelistMiddleware(BaseHTTPMiddleware):
    """Restrict admin/docs/metrics access by IP whitelist from DB settings."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Only check protected paths
        if not any(path.startswith(prefix) for prefix in PROTECTED_PREFIXES):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        try:
            async with async_session_factory() as db:
                repo = SettingsRepository(db)
                settings = await repo.get()
                whitelist = settings.admin_ip_whitelist or []
        except Exception:
            whitelist = []

        # If whitelist is empty, allow all (for initial setup)
        if whitelist and client_ip not in whitelist:
            logger.warning("ip_whitelist_denied", ip=client_ip, path=path)
            return Response(
                content='{"detail":"Доступ запрещён"}',
                status_code=403,
                media_type="application/json",
            )

        return await call_next(request)
