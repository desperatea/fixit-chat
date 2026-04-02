"""Tests for AES-256-GCM encryption."""
from app.core.encryption import encrypt, decrypt
from app.services.encryption_service import EncryptionService


class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        plaintext = "Секретные данные"
        encrypted = encrypt(plaintext)
        assert encrypted != plaintext
        assert decrypt(encrypted) == plaintext

    def test_encrypt_empty_string(self):
        assert encrypt("") == ""
        assert decrypt("") == ""

    def test_encrypt_produces_unique_ciphertexts(self):
        """Each encryption should use a unique nonce, producing different ciphertexts."""
        plaintext = "Одинаковый текст"
        c1 = encrypt(plaintext)
        c2 = encrypt(plaintext)
        assert c1 != c2  # different nonces
        assert decrypt(c1) == decrypt(c2) == plaintext

    def test_encrypt_unicode(self):
        text = "Привет мир! 🌍 Тест Unicode"
        assert decrypt(encrypt(text)) == text

    def test_encrypt_long_text(self):
        text = "A" * 10000
        assert decrypt(encrypt(text)) == text


class TestEncryptionService:
    def test_encrypt_session_data(self):
        service = EncryptionService()
        data = {
            "visitor_name": "Иван",
            "visitor_phone": "+78634441160",
            "visitor_org": "ООО Тест",
            "initial_message": "Помогите",
        }
        encrypted = service.encrypt_session_data(data)

        # All fields should be encrypted (different from original)
        assert encrypted["visitor_name"] != "Иван"
        assert encrypted["visitor_phone"] != "+78634441160"
        assert encrypted["visitor_org"] != "ООО Тест"
        assert encrypted["initial_message"] != "Помогите"

    def test_encrypt_session_data_none_fields(self):
        service = EncryptionService()
        data = {
            "visitor_name": "Иван",
            "visitor_phone": None,
            "visitor_org": None,
            "initial_message": "Помогите",
        }
        encrypted = service.encrypt_session_data(data)
        assert encrypted["visitor_phone"] is None
        assert encrypted["visitor_org"] is None

    def test_encrypt_decrypt_message_content(self):
        service = EncryptionService()
        content = "Текст сообщения"
        encrypted = service.encrypt_message_content(content)
        assert encrypted != content
        assert service.decrypt_message_content(encrypted) == content
