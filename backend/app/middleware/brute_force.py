import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.database import async_session_factory
from app.repositories.login_attempt_repo import LoginAttemptRepository

logger = structlog.get_logger()


class BruteForceMiddleware(BaseHTTPMiddleware):
    """Block IPs with too many failed login attempts."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path != "/api/v1/admin/auth/login" or request.method != "POST":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        # Check recent failures
        async with async_session_factory() as db:
            repo = LoginAttemptRepository(db)
            failures = await repo.count_recent_failures(
                client_ip, minutes=settings.login_block_minutes,
            )

            if failures >= settings.max_login_attempts:
                logger.warning("brute_force_blocked", ip=client_ip, failures=failures)
                return Response(
                    content='{"detail":"IP заблокирован. Повторите через 15 минут."}',
                    status_code=429,
                    media_type="application/json",
                )

        response = await call_next(request)

        # Record attempt result
        async with async_session_factory() as db:
            repo = LoginAttemptRepository(db)
            await repo.record(client_ip, success=(response.status_code == 200))
            await db.commit()

        return response
