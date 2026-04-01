from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_agent, get_db, get_redis_client
from app.config import settings
from app.models.agent import Agent
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth_service import JWTAuthProvider

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/v1/admin/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/admin/auth",
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis_client=Depends(get_redis_client),
):
    auth = JWTAuthProvider(db, redis_client)
    agent = await auth.authenticate(data.username, data.password)
    access, refresh = await auth.create_tokens(agent)

    _set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access)


@router.post("/refresh", response_model=TokenResponse)
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

    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(access_token=access)


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    agent: Agent = Depends(get_current_agent),
    redis_client=Depends(get_redis_client),
):
    refresh_token = request.cookies.get("refresh_token")
    auth = JWTAuthProvider.__new__(JWTAuthProvider)
    auth.redis = redis_client
    await auth.logout(agent.id, refresh_token)

    _clear_refresh_cookie(response)
