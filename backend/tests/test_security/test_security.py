"""Tests for security: password hashing, JWT tokens."""
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_password(self):
        hashed = hash_password("MyPassword123")
        assert hashed != "MyPassword123"
        assert hashed.startswith("$2b$")

    def test_verify_correct_password(self):
        hashed = hash_password("MyPassword123")
        assert verify_password("MyPassword123", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("MyPassword123")
        assert verify_password("WrongPassword", hashed) is False

    def test_different_hashes_same_password(self):
        h1 = hash_password("Same")
        h2 = hash_password("Same")
        assert h1 != h2  # different salts
        assert verify_password("Same", h1) is True
        assert verify_password("Same", h2) is True


class TestJWT:
    def test_create_access_token(self):
        agent_id = uuid.uuid4()
        token = create_access_token(agent_id)

        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == str(agent_id)
        assert payload["type"] == "access"

    def test_create_refresh_token(self):
        agent_id = uuid.uuid4()
        token = create_refresh_token(agent_id)

        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == str(agent_id)
        assert payload["type"] == "refresh"

    def test_decode_invalid_token(self):
        assert decode_token("invalid.token.here") is None

    def test_decode_expired_token(self):
        agent_id = uuid.uuid4()
        payload = {
            "sub": str(agent_id),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "type": "access",
        }
        token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
        assert decode_token(token) is None

    def test_decode_wrong_secret(self):
        agent_id = uuid.uuid4()
        payload = {
            "sub": str(agent_id),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "type": "access",
        }
        token = jwt.encode(payload, "wrong-secret-key", algorithm="HS256")
        assert decode_token(token) is None

    def test_access_token_expiry(self):
        agent_id = uuid.uuid4()
        token = create_access_token(agent_id)
        payload = decode_token(token)

        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        # Should expire in ~15 minutes
        diff = (exp - now).total_seconds()
        assert 800 < diff < 960  # roughly 15 minutes
