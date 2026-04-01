import time

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.redis import get_redis

logger = structlog.get_logger()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting via Redis sliding window."""

    async def dispatch(self, request: Request, call_next):
        # Skip health/docs
        path = request.url.path
        if path in ("/health", "/docs", "/openapi.json"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        # Stricter limit for login
        if path == "/api/v1/admin/auth/login" and request.method == "POST":
            limit = settings.login_rate_limit_per_minute
            key = f"rate:login:{client_ip}"
        else:
            limit = settings.rate_limit_per_minute
            key = f"rate:api:{client_ip}"

        r = get_redis()
        now = time.time()
        window = 60  # 1 minute

        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window)
        results = await pipe.execute()

        current_count = results[2]

        if current_count > limit:
            logger.warning("rate_limit_exceeded", ip=client_ip, path=path, count=current_count)
            return Response(
                content='{"detail":"Слишком много запросов"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": "60"},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - current_count))
        return response
