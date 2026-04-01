import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_agent, get_db
from app.models.agent import Agent
from app.repositories.note_repo import NoteRepository
from app.schemas.note import NoteCreate, NoteResponse
from app.services.encryption_service import EncryptionService

router = APIRouter(prefix="/sessions/{session_id}/notes", tags=["admin-notes"])


@router.get("", response_model=list[NoteResponse])
async def get_notes(
    session_id: uuid.UUID,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    repo = NoteRepository(db)
    notes = await repo.get_by_session(session_id)
    enc = EncryptionService()
    result = []
    for note in notes:
        note.content = enc.decrypt_note_content(note.content)
        resp = NoteResponse.model_validate(note)
        resp.agent_name = note.agent.display_name if note.agent else None
        result.append(resp)
    return result


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    session_id: uuid.UUID,
    data: NoteCreate,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    enc = EncryptionService()
    repo = NoteRepository(db)

    note = await repo.create(
        session_id=session_id,
        agent_id=agent.id,
        content=enc.encrypt_note_content(data.content),
    )

    note.content = data.content
    resp = NoteResponse.model_validate(note)
    resp.agent_name = agent.display_name
    return resp
