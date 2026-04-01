import os
import uuid

import magic
from fastapi import UploadFile

from app.config import settings
from app.core.exceptions import BadRequestError
from app.models.attachment import Attachment
from app.repositories.base import BaseRepository


class FileService:
    MIME_EXTENSION_MAP = {
        "image/jpeg": ["jpg", "jpeg"],
        "image/png": ["png"],
        "image/gif": ["gif"],
        "image/webp": ["webp"],
        "application/pdf": ["pdf"],
        "application/msword": ["doc"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
        "application/vnd.ms-excel": ["xls"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
    }

    def __init__(self, db, allowed_types: list[str] | None = None, max_size_mb: int | None = None):
        self.db = db
        self.attachment_repo = BaseRepository(Attachment, db)
        self.allowed_types = allowed_types or ["jpg", "jpeg", "png", "gif", "webp", "pdf"]
        self.max_size_mb = max_size_mb or settings.max_file_size_mb

    async def upload(self, file: UploadFile, message_id: uuid.UUID) -> Attachment:
        # Read file content
        content = await file.read()

        # Validate size
        if len(content) > self.max_size_mb * 1024 * 1024:
            raise BadRequestError(f"Файл слишком большой. Максимум {self.max_size_mb} МБ")

        # Validate MIME type by magic bytes
        detected_mime = magic.from_buffer(content, mime=True)
        allowed_mimes = []
        for mime, exts in self.MIME_EXTENSION_MAP.items():
            if any(ext in self.allowed_types for ext in exts):
                allowed_mimes.append(mime)

        if detected_mime not in allowed_mimes:
            raise BadRequestError(f"Тип файла {detected_mime} не разрешён")

        # Generate safe filename
        ext = os.path.splitext(file.filename or "file")[1].lstrip(".").lower()
        if ext not in self.allowed_types:
            # Use extension from detected MIME
            exts = self.MIME_EXTENSION_MAP.get(detected_mime, [])
            ext = exts[0] if exts else "bin"

        safe_name = f"{uuid.uuid4().hex}.{ext}"
        file_path = os.path.join(settings.upload_dir, safe_name)

        # Save to disk
        os.makedirs(settings.upload_dir, exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(content)

        # Create DB record
        attachment = await self.attachment_repo.create(
            message_id=message_id,
            file_name=file.filename or safe_name,
            file_path=file_path,
            file_size=len(content),
            mime_type=detected_mime,
        )

        return attachment

    @staticmethod
    def get_file_path(attachment: Attachment) -> str:
        if not os.path.exists(attachment.file_path):
            raise BadRequestError("Файл не найден на диске")
        return attachment.file_path
