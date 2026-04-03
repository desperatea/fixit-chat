import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = structlog.get_logger()

# Default origins for test mode (before DB is available)
DEFAULT_ORIGINS = ["*"]


class CORSWithWSMiddleware(CORSMiddleware):
    """CORS middleware that skips WebSocket connections."""

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


def setup_cors(app: FastAPI, origins: list[str] | None = None) -> None:
    """Add CORS middleware.

    If origins is empty or contains "*", all origins are allowed (test/setup mode).
    In production, set specific origins in widget_settings.allowed_origins via admin panel.
    """
    allow_origins = origins or DEFAULT_ORIGINS

    if "*" in allow_origins or not allow_origins:
        # Test mode: allow all, but without credentials for security
        app.add_middleware(
            CORSWithWSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Visitor-Token"],
            expose_headers=["X-Request-ID"],
        )
    else:
        # Production: specific origins with credentials
        app.add_middleware(
            CORSWithWSMiddleware,
            allow_origins=allow_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Visitor-Token"],
            expose_headers=["X-Request-ID"],
        )
