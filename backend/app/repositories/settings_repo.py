from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import WidgetSettings


class SettingsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self) -> WidgetSettings:
        """Get or create singleton settings row."""
        stmt = select(WidgetSettings).where(WidgetSettings.id == 1)
        result = await self.session.execute(stmt)
        settings = result.scalar_one_or_none()
        if settings is None:
            settings = WidgetSettings(id=1)
            self.session.add(settings)
            await self.session.flush()
        return settings

    async def update(self, **kwargs: Any) -> WidgetSettings:
        settings = await self.get()
        for key, value in kwargs.items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        await self.session.flush()
        return settings
