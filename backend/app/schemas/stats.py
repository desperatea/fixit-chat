from datetime import date

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_sessions: int
    open_sessions: int
    closed_sessions: int
    total_messages: int
    avg_rating: float | None
    avg_response_time_seconds: float | None


class DailyStats(BaseModel):
    date: date
    sessions: int
    messages: int
    avg_rating: float | None
