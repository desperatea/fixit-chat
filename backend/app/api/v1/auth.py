from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_agent, get_db, get_redis_client
from app.config import settings
from app.models.agent import Agent
from app.schemas.auth import LoginRequest
from app.services.auth_service import JWTAuthProvider

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set both tokens as httpOnly cookies."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # False for test (HTTP), True for prod (HTTPS)
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/v1/admin/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/api/v1/admin/auth")


@router.post("/login")
async def login(
    data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis_client=Depends(get_redis_client),
):
    auth = JWTAuthProvider(db, redis_client)
    agent = await auth.authenticate(data.username, data.password)
    access, refresh = await auth.create_tokens(agent)

    _set_auth_cookies(response, access, refresh)
    return {"status": "ok"}


@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis_client=Depends(get_redis_client),
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        from app.core.exceptions import UnauthorizedError
        raise UnauthorizedError("Refresh токен отсутствует")

    auth = JWTAuthProvider(db, redis_client)
    access, new_refresh = await auth.refresh_access_token(refresh_token)

    _set_auth_cookies(response, access, new_refresh)
    return {"status": "ok"}


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
    redis_client=Depends(get_redis_client),
):
    refresh_token = request.cookies.get("refresh_token")
    auth = JWTAuthProvider(db, redis_client)
    await auth.logout(agent.id, refresh_token)

    _clear_auth_cookies(response)


@router.get("/me")
async def me(agent: Agent = Depends(get_current_agent)):
    """Check if authenticated. Returns current agent info."""
    return {
        "id": str(agent.id),
        "username": agent.username,
        "display_name": agent.display_name,
    }
