"""odyssey schema: campaigns, ballots, votes, episodes, outbox, guards and grants

Revision ID: odyssey_0001
Revises:
"""

from pathlib import Path

from alembic import op

revision = "odyssey_0001"
down_revision = None
branch_labels = None
depends_on = None

_HERE = Path(__file__).parent


def upgrade() -> None:
    op.get_bind().exec_driver_sql((_HERE / "0001_init.up.sql").read_text())


def downgrade() -> None:
    op.get_bind().exec_driver_sql((_HERE / "0001_init.down.sql").read_text())
