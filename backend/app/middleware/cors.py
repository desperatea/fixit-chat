from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import async_session_factory
from app.repositories.settings_repo import SettingsRepository


async def get_allowed_origins() -> list[str]:
    """Load allowed origins from DB settings."""
    try:
        async with async_session_factory() as db:
            repo = SettingsRepository(db)
            settings = await repo.get()
            return settings.allowed_origins or []
    except Exception:
        return ["https://fixitmail.ru"]


def setup_cors(app: FastAPI) -> None:
    """Add CORS middleware. Origins are loaded on startup and can be refreshed."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Will be restricted by CORSValidationMiddleware
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
