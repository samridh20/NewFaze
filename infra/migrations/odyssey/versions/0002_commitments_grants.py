"""odyssey 0002: prediction commitment, audit log, append-only guards, tighter grants (CC-1, CC-6, CC-10, CC-11)
Revision ID: odyssey_0002
Revises: odyssey_0001
"""
from pathlib import Path
from alembic import op
revision = "odyssey_0002"
down_revision = "odyssey_0001"
branch_labels = None
depends_on = None
_HERE = Path(__file__).parent
def upgrade() -> None:
    op.get_bind().exec_driver_sql((_HERE / "0002_commitments_grants.up.sql").read_text())
def downgrade() -> None:
    op.get_bind().exec_driver_sql((_HERE / "0002_commitments_grants.down.sql").read_text())
