from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_agent, get_db
from app.models.agent import Agent
from app.models.message import Message
from app.models.session import ChatSession
from app.schemas.stats import DailyStats, DashboardStats

router = APIRouter(prefix="/stats", tags=["admin-stats"])


@router.get("", response_model=DashboardStats)
async def get_stats(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    # Total and status counts
    total_stmt = select(func.count()).select_from(ChatSession).where(
        ChatSession.deleted_at.is_(None)
    )
    total = (await db.execute(total_stmt)).scalar_one()

    open_stmt = total_stmt.where(ChatSession.status == "open")
    open_count = (await db.execute(open_stmt)).scalar_one()

    closed_count = total - open_count

    # Total messages
    msg_stmt = select(func.count()).select_from(Message)
    total_messages = (await db.execute(msg_stmt)).scalar_one()

    # Avg rating
    avg_stmt = select(func.avg(ChatSession.rating)).where(
        ChatSession.rating.is_not(None),
        ChatSession.deleted_at.is_(None),
    )
    avg_rating = (await db.execute(avg_stmt)).scalar_one()

    return DashboardStats(
        total_sessions=total,
        open_sessions=open_count,
        closed_sessions=closed_count,
        total_messages=total_messages,
        avg_rating=round(float(avg_rating), 2) if avg_rating else None,
        avg_response_time_seconds=None,  # TODO: calculate when we have enough data
    )


@router.get("/daily", response_model=list[DailyStats])
async def get_daily_stats(
    days: int = Query(30, ge=1, le=90),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    since = date.today() - timedelta(days=days)

    # Sessions per day
    session_stmt = (
        select(
            func.date_trunc("day", ChatSession.created_at).label("day"),
            func.count().label("sessions"),
            func.avg(ChatSession.rating).label("avg_rating"),
        )
        .where(
            ChatSession.deleted_at.is_(None),
            func.cast(ChatSession.created_at, func.date.__class__) >= since,
        )
        .group_by("day")
        .order_by("day")
    )

    # Messages per day
    msg_stmt = (
        select(
            func.date_trunc("day", Message.created_at).label("day"),
            func.count().label("messages"),
        )
        .where(Message.created_at >= str(since))
        .group_by("day")
    )

    session_result = await db.execute(session_stmt)
    msg_result = await db.execute(msg_stmt)

    session_rows = {row.day.date(): row for row in session_result}
    msg_rows = {row.day.date(): row.messages for row in msg_result}

    result = []
    for i in range(days):
        d = since + timedelta(days=i)
        s_row = session_rows.get(d)
        result.append(DailyStats(
            date=d,
            sessions=s_row.sessions if s_row else 0,
            messages=msg_rows.get(d, 0),
            avg_rating=round(float(s_row.avg_rating), 2) if s_row and s_row.avg_rating else None,
        ))

    return result
