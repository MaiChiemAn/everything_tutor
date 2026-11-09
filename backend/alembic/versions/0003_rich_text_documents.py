"""Store question text as structured TipTap JSON documents."""
import json

from alembic import op
import sqlalchemy as sa

revision = "0003_rich_text"
down_revision = "0002_collections"
branch_labels = None
depends_on = None

TEXT_COLUMNS = ("content", "option_a", "option_b", "option_c", "option_d", "explanation")


def to_document(value):
    if value is None:
        return None
    if isinstance(value, dict) and value.get("type") == "doc":
        return value
    paragraphs = []
    for line in str(value).split("\n"):
        paragraphs.append({"type": "paragraph", "content": [{"type": "text", "text": line}]} if line else {"type": "paragraph"})
    return {"type": "doc", "content": paragraphs}


def upgrade():
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, content, option_a, option_b, option_c, option_d, explanation FROM questions")).mappings().all()
    for row in rows:
        values = {column: json.dumps(to_document(row[column]), ensure_ascii=False) if row[column] is not None else None for column in TEXT_COLUMNS}
        connection.execute(
            sa.text("UPDATE questions SET content=:content, option_a=:option_a, option_b=:option_b, option_c=:option_c, option_d=:option_d, explanation=:explanation WHERE id=:id"),
            {"id": row["id"], **values},
        )

    if connection.dialect.name == "postgresql":
        for column in TEXT_COLUMNS:
            op.alter_column("questions", column, existing_type=sa.Text(), type_=sa.JSON(), postgresql_using=f"{column}::json")
    else:
        with op.batch_alter_table("questions") as batch:
            for column in TEXT_COLUMNS:
                batch.alter_column(column, existing_type=sa.Text(), type_=sa.JSON())

    op.add_column("quiz_answers", sa.Column("question_snapshot", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("quiz_answers", "question_snapshot")
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        for column in TEXT_COLUMNS:
            op.alter_column("questions", column, existing_type=sa.JSON(), type_=sa.Text(), postgresql_using=f"{column}::text")
    else:
        with op.batch_alter_table("questions") as batch:
            for column in TEXT_COLUMNS:
                batch.alter_column(column, existing_type=sa.JSON(), type_=sa.Text())
