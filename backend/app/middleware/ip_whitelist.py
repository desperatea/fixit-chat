import time

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.database import async_session_factory
from app.repositories.settings_repo import SettingsRepository

logger = structlog.get_logger()

PROTECTED_PREFIXES = ("/api/v1/admin", "/docs", "/metrics")

# Cache whitelist to avoid DB query on every request
_whitelist_cache: list[str] = []
_whitelist_cache_time: float = 0
_CACHE_TTL = 60  # seconds


async def _get_whitelist() -> list[str]:
    global _whitelist_cache, _whitelist_cache_time
    now = time.time()
    if (now - _whitelist_cache_time) < _CACHE_TTL:
        return _whitelist_cache
    try:
        async with async_session_factory() as db:
            repo = SettingsRepository(db)
            settings = await repo.get()
            _whitelist_cache = settings.admin_ip_whitelist or []
            _whitelist_cache_time = now
    except Exception:
        logger.warning("ip_whitelist_db_error")
        # Fail-closed: if DB is down and no cache, deny access
        if not _whitelist_cache:
            _whitelist_cache = ["__deny_all__"]
            _whitelist_cache_time = now
    return _whitelist_cache


class IPWhitelistMiddleware(BaseHTTPMiddleware):
    """Restrict admin/docs/metrics access by IP whitelist from DB settings."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if not any(path.startswith(prefix) for prefix in PROTECTED_PREFIXES):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        whitelist = await _get_whitelist()

        # Empty whitelist = allow all (initial setup / test mode)
        if whitelist and client_ip not in whitelist:
            logger.warning("ip_whitelist_denied", ip=client_ip, path=path)
            return Response(
                content='{"detail":"Доступ запрещён"}',
                status_code=403,
                media_type="application/json",
            )

        return await call_next(request)
