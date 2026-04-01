from app.core.encryption import decrypt, encrypt


class EncryptionService:
    """Encrypts/decrypts personal data fields (visitor_name, phone, etc.)."""

    ENCRYPTED_SESSION_FIELDS = ("visitor_name", "visitor_phone", "visitor_org", "initial_message")
    ENCRYPTED_MESSAGE_FIELDS = ("content",)
    ENCRYPTED_NOTE_FIELDS = ("content",)

    @staticmethod
    def encrypt_session_data(data: dict) -> dict:
        result = dict(data)
        for field in EncryptionService.ENCRYPTED_SESSION_FIELDS:
            if field in result and result[field]:
                result[field] = encrypt(result[field])
        return result

    @staticmethod
    def decrypt_session(session) -> None:
        """Decrypt session fields in-place for response."""
        for field in EncryptionService.ENCRYPTED_SESSION_FIELDS:
            value = getattr(session, field, None)
            if value:
                setattr(session, field, decrypt(value))

    @staticmethod
    def encrypt_message_content(content: str) -> str:
        return encrypt(content)

    @staticmethod
    def decrypt_message_content(content: str) -> str:
        return decrypt(content)

    @staticmethod
    def encrypt_note_content(content: str) -> str:
        return encrypt(content)

    @staticmethod
    def decrypt_note_content(content: str) -> str:
        return decrypt(content)
