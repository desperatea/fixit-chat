import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

_KEY: bytes | None = None


def _get_key() -> bytes:
    global _KEY
    if _KEY is None:
        if not settings.encryption_key:
            raise RuntimeError("ENCRYPTION_KEY is not set")
        _KEY = base64.b64decode(settings.encryption_key)
        if len(_KEY) != 32:
            raise RuntimeError("ENCRYPTION_KEY must be 32 bytes (base64 encoded)")
    return _KEY


def encrypt(plaintext: str) -> str:
    """Encrypt string with AES-256-GCM. Returns base64(nonce + ciphertext + tag)."""
    if not plaintext:
        return ""
    key = _get_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt(encrypted: str) -> str:
    """Decrypt base64(nonce + ciphertext + tag) with AES-256-GCM."""
    if not encrypted:
        return ""
    key = _get_key()
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ciphertext = raw[12:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")
