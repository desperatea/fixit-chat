from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.login_attempt import LoginAttempt


class LoginAttemptRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def record(self, ip_address: str, *, success: bool = False) -> LoginAttempt:
        attempt = LoginAttempt(ip_address=ip_address, success=success)
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def count_recent_failures(self, ip_address: str, *, minutes: int = 15) -> int:
        since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        stmt = (
            select(func.count())
            .select_from(LoginAttempt)
            .where(
                LoginAttempt.ip_address == ip_address,
                LoginAttempt.success.is_(False),
                LoginAttempt.attempted_at >= since,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def cleanup_old(self, *, days: int = 30) -> int:
        """Delete attempts older than N days."""
        from sqlalchemy import delete

        since = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = delete(LoginAttempt).where(LoginAttempt.attempted_at < since)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount
