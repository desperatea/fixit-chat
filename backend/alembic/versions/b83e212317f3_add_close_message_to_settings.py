"""add close_message to settings

Revision ID: b83e212317f3
Revises: 3c2cfcc416f4
Create Date: 2026-04-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b83e212317f3"
down_revision: Union[str, None] = "3c2cfcc416f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("widget_settings", sa.Column(
        "close_message", sa.Text(),
        nullable=False,
        server_default="Сессия завершена. Спасибо за обращение!",
    ))


def downgrade() -> None:
    op.drop_column("widget_settings", "close_message")
