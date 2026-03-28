"""initial schema

Revision ID: 5b64dd02b186
Revises:
Create Date: 2026-03-28 18:56:52.223372

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5b64dd02b186"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create initial tables: categories, terms, definitions."""
    op.create_table(
        "categories",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "parent_id",
            sa.String(100),
            sa.ForeignKey("categories.id"),
            nullable=True,
        ),
        sa.Column("label", sa.String(200), nullable=False),
    )

    op.create_table(
        "terms",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("term", sa.String(300), nullable=False, unique=True, index=True),
    )

    op.create_table(
        "definitions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "term_id",
            sa.Integer,
            sa.ForeignKey("terms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("en", sa.Text, nullable=False),
        sa.Column("da", sa.Text, nullable=True),
        sa.Column(
            "category_id",
            sa.String(100),
            sa.ForeignKey("categories.id"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table("definitions")
    op.drop_table("terms")
    op.drop_table("categories")
