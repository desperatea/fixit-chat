from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_agent, get_db
from app.models.agent import Agent
from app.repositories.settings_repo import SettingsRepository
from app.schemas.settings import WidgetSettingsAdminResponse, WidgetSettingsUpdate
from app.services.encryption_service import EncryptionService

router = APIRouter(prefix="/settings", tags=["admin-settings"])


@router.get("", response_model=WidgetSettingsAdminResponse)
async def get_settings(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    return await repo.get()


@router.put("", response_model=WidgetSettingsAdminResponse)
async def update_settings(
    data: WidgetSettingsUpdate,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    update_data = data.model_dump(exclude_unset=True)

    # Encrypt telegram token if provided
    if "telegram_bot_token" in update_data and update_data["telegram_bot_token"]:
        enc = EncryptionService()
        update_data["telegram_bot_token"] = enc.encrypt_message_content(
            update_data["telegram_bot_token"]
        )

    return await repo.update(**update_data)
