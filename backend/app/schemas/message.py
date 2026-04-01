import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.attachment import AttachmentResponse


class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    sender_type: str
    sender_id: uuid.UUID | None
    content: str
    is_read: bool
    read_at: datetime | None
    created_at: datetime
    attachments: list[AttachmentResponse] = []


class ReadMessagesRequest(BaseModel):
    message_ids: list[uuid.UUID]
