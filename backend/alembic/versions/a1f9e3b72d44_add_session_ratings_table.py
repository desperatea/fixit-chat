"""add session_ratings table, migrate rating data, drop rating column

Revision ID: a1f9e3b72d44
Revises: b83e212317f3
Create Date: 2026-04-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "a1f9e3b72d44"
down_revision: Union[str, None] = "b83e212317f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create session_ratings table
    op.create_table(
        "session_ratings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_ratings_value"),
    )
    op.create_index("idx_ratings_session", "session_ratings", ["session_id"])

    # 2. Migrate existing ratings
    op.execute("""
        INSERT INTO session_ratings (id, session_id, rating, created_at)
        SELECT gen_random_uuid(), id, rating, COALESCE(closed_at, updated_at)
        FROM chat_sessions
        WHERE rating IS NOT NULL AND deleted_at IS NULL
    """)

    # 3. Drop rating column and constraint from chat_sessions
    op.drop_constraint("ck_sessions_rating", "chat_sessions", type_="check")
    op.drop_column("chat_sessions", "rating")


def downgrade() -> None:
    # Recreate rating column
    op.add_column("chat_sessions", sa.Column("rating", sa.SmallInteger(), nullable=True))
    op.create_check_constraint("ck_sessions_rating", "chat_sessions", "rating BETWEEN 1 AND 5")

    # Copy latest rating back
    op.execute("""
        UPDATE chat_sessions SET rating = sub.rating
        FROM (
            SELECT DISTINCT ON (session_id) session_id, rating
            FROM session_ratings
            ORDER BY session_id, created_at DESC
        ) sub
        WHERE chat_sessions.id = sub.session_id
    """)

    # Drop session_ratings table
    op.drop_index("idx_ratings_session", table_name="session_ratings")
    op.drop_table("session_ratings")
