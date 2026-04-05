import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SessionCreate(BaseModel):
    visitor_name: str = Field(..., min_length=1, max_length=100)
    visitor_phone: str | None = Field(None, max_length=50)
    visitor_org: str | None = Field(None, max_length=200)
    initial_message: str = Field(..., min_length=1, max_length=5000)
    consent_given: bool = True
    captcha_token: str | None = None
    custom_fields: dict | None = None


class SessionCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    visitor_token: str
    status: str
    created_at: datetime


class RatingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rating: int
    created_at: datetime


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    visitor_name: str
    visitor_phone: str | None
    visitor_org: str | None
    initial_message: str
    status: str
    ratings: list[RatingResponse] = []
    latest_rating: int | None = None
    consent_given: bool
    custom_fields: dict | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    unread_count: int = 0


class SessionUpdate(BaseModel):
    status: str | None = Field(None, pattern="^(open|closed)$")


class SessionListResponse(BaseModel):
    items: list[SessionResponse]
    total: int
    offset: int
    limit: int


class RatingCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)


class GlpiSessionCreate(BaseModel):
    """Create session from GLPI-authenticated user (signed token)."""
    glpi_token: str = Field(..., min_length=1)
    initial_message: str = Field(..., min_length=1, max_length=5000)
