"""wh schema: events and frozen outcome sets

Revision ID: wh_0002
Revises: wh_0001
"""

from pathlib import Path

from alembic import op

revision = "wh_0002"
down_revision = "wh_0001"
branch_labels = None
depends_on = None

_HERE = Path(__file__).parent


def upgrade() -> None:
    op.get_bind().exec_driver_sql((_HERE / "0002_relay_week2.up.sql").read_text())


def downgrade() -> None:
    op.get_bind().exec_driver_sql((_HERE / "0002_relay_week2.down.sql").read_text())
