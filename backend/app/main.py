from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.core.database import engine

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("fixit_chat_starting")
    yield
    await engine.dispose()
    logger.info("fixit_chat_stopped")


def create_app() -> FastAPI:
    application = FastAPI(
        title="FixIT Chat API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
        lifespan=lifespan,
    )

    # --- Middleware (order matters: last added = first executed) ---
    from app.middleware.security_headers import SecurityHeadersMiddleware
    from app.middleware.rate_limit import RateLimitMiddleware
    from app.middleware.brute_force import BruteForceMiddleware
    from app.middleware.ip_whitelist import IPWhitelistMiddleware
    from app.middleware.cors import setup_cors

    # 1. Security headers (outermost — runs first)
    application.add_middleware(SecurityHeadersMiddleware)
    # 2. CORS
    setup_cors(application)
    # 3. IP whitelist for admin
    application.add_middleware(IPWhitelistMiddleware)
    # 4. Rate limiting
    application.add_middleware(RateLimitMiddleware)
    # 5. Brute force protection (innermost for login)
    application.add_middleware(BruteForceMiddleware)

    # --- Routes ---
    from app.api.v1.router import v1_router
    from app.api.ws.chat import router as ws_chat_router
    from app.api.ws.admin import router as ws_admin_router

    application.include_router(v1_router, prefix="/api/v1")
    application.include_router(ws_chat_router)
    application.include_router(ws_admin_router)

    @application.get("/health")
    async def health():
        return {"status": "ok"}

    return application


app = create_app()
