import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_agent, get_db
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.agent import Agent
from app.repositories.agent_repo import AgentRepository
from app.schemas.agent import AgentCreate, AgentResponse, AgentUpdate
from app.services.auth_service import JWTAuthProvider

router = APIRouter(prefix="/agents", tags=["admin-agents"])


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    repo = AgentRepository(db)
    return await repo.get_active()


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(
    data: AgentCreate,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    repo = AgentRepository(db)

    existing = await repo.get_by_username(data.username)
    if existing:
        raise BadRequestError(f"Логин '{data.username}' уже занят")

    new_agent = await repo.create(
        username=data.username,
        password_hash=JWTAuthProvider.hash_password(data.password),
        display_name=data.display_name,
    )
    return new_agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID,
    data: AgentUpdate,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    repo = AgentRepository(db)
    target = await repo.get_by_id(agent_id)
    if not target:
        raise NotFoundError("Агент не найден")

    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["password_hash"] = JWTAuthProvider.hash_password(update_data.pop("password"))

    await repo.update(target, **update_data)
    return target


@router.delete("/{agent_id}", status_code=204)
async def deactivate_agent(
    agent_id: uuid.UUID,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    if agent.id == agent_id:
        raise BadRequestError("Нельзя деактивировать самого себя")

    repo = AgentRepository(db)
    target = await repo.get_by_id(agent_id)
    if not target:
        raise NotFoundError("Агент не найден")

    await repo.update(target, is_active=False)
