"""GLPI integration: signed token verification.

Token format: base64url(json_payload).hex(hmac_sha256(payload_b64, secret))

Payload example:
{
  "user_id": "5",
  "name": "Иванов Иван",
  "phone": "+79001234567",
  "org": "ООО Ромашка",
  "exp": 1735689600
}
"""

import base64
import hashlib
import hmac
import json
import time

from app.config import settings
from app.core.exceptions import BadRequestError, ForbiddenError


class GlpiTokenData:
    """Verified GLPI user data extracted from token."""

    def __init__(self, user_id: str, name: str, phone: str | None, org: str | None, entity_id: str | None = None):
        self.user_id = user_id
        self.name = name
        self.phone = phone
        self.org = org
        self.entity_id = entity_id


def verify_glpi_token(token: str) -> GlpiTokenData:
    """Verify HMAC-signed GLPI token and return user data.

    Raises BadRequestError on invalid format, ForbiddenError on bad signature.
    """
    secret = settings.glpi_integration_secret
    if not secret:
        raise BadRequestError("GLPI integration not configured")

    parts = token.split(".")
    if len(parts) != 2:
        raise BadRequestError("Invalid GLPI token format")

    payload_b64, signature_hex = parts

    # Verify HMAC signature
    expected = hmac.new(
        secret.encode(), payload_b64.encode(), hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature_hex):
        raise ForbiddenError("Invalid GLPI token signature")

    # Decode payload
    try:
        # Add padding if needed
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload_json = base64.urlsafe_b64decode(padded)
        data = json.loads(payload_json)
    except (ValueError, json.JSONDecodeError) as e:
        raise BadRequestError(f"Invalid GLPI token payload: {e}")

    # Check expiration
    exp = data.get("exp", 0)
    if exp and time.time() > exp:
        raise ForbiddenError("GLPI token expired")

    # Extract required fields
    user_id = data.get("user_id")
    name = data.get("name")
    if not user_id or not name:
        raise BadRequestError("GLPI token missing user_id or name")

    return GlpiTokenData(
        user_id=str(user_id),
        name=name,
        phone=data.get("phone"),
        org=data.get("org"),
        entity_id=data.get("glpi_entity_id"),
    )
