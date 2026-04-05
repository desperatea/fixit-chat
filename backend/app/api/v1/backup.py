import asyncio
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.api.deps import get_current_agent
from app.models.agent import Agent

router = APIRouter(prefix="/backup", tags=["admin-backup"])

BACKUP_DIR = Path("/backups")
BACKUP_SCRIPT = Path("/scripts/backup.sh")


@router.get("")
async def list_backups(agent: Agent = Depends(get_current_agent)):
    """List available backups."""
    if not BACKUP_DIR.exists():
        return {"backups": []}

    backups = []
    for f in sorted(BACKUP_DIR.glob("*.gz"), reverse=True):
        stat = f.stat()
        backups.append({
            "name": f.name,
            "size": stat.st_size,
            "size_human": _human_size(stat.st_size),
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "type": "database" if f.name.startswith("db_") else "uploads",
        })

    return {"backups": backups}


@router.post("")
async def create_backup(agent: Agent = Depends(get_current_agent)):
    """Run backup script and return result."""
    if not BACKUP_SCRIPT.exists():
        return {"status": "error", "message": "Backup script not found"}

    proc = await asyncio.create_subprocess_exec(
        "bash", str(BACKUP_SCRIPT),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode == 0:
        return {
            "status": "ok",
            "message": "Бэкап создан",
            "output": stdout.decode().strip(),
        }
    return {
        "status": "error",
        "message": stderr.decode().strip() or "Ошибка создания бэкапа",
    }


@router.get("/{filename}")
async def download_backup(
    filename: str,
    agent: Agent = Depends(get_current_agent),
):
    """Download a backup file."""
    # Prevent path traversal
    safe_name = Path(filename).name
    file_path = BACKUP_DIR / safe_name

    if not file_path.exists() or not file_path.suffix == ".gz":
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Файл не найден")

    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/gzip",
    )


def _human_size(size: int) -> str:
    for unit in ("Б", "КБ", "МБ", "ГБ"):
        if size < 1024:
            return f"{size:.0f} {unit}"
        size /= 1024
    return f"{size:.1f} ТБ"
