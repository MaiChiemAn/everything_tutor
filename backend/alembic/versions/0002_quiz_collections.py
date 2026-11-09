"""Add collections and attach existing questions to a legacy collection."""
from datetime import datetime, timezone
import secrets

from alembic import op
import sqlalchemy as sa

revision = "0002_collections"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "quiz_collections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_quiz_collections_created_by", "quiz_collections", ["created_by"])

    connection = op.get_bind()
    has_questions = connection.execute(sa.text("SELECT 1 FROM questions LIMIT 1")).first() is not None
    if has_questions:
        teacher_id = connection.execute(sa.text("SELECT id FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1")).scalar()
        if teacher_id is None:
            # Old installs could contain questions but no teacher account. Keep those
            # rows owned by a non-login legacy account rather than assigning them to a student.
            from app.core.security import hash_password

            now = datetime.now(timezone.utc)
            result = connection.execute(
                sa.text("INSERT INTO users (email, full_name, password_hash, role, created_at) VALUES (:email, :name, :password, 'teacher', :created_at)"),
                {"email": "legacy-content-owner@system.invalid", "name": "Legacy content owner", "password": hash_password(secrets.token_urlsafe(32)), "created_at": now},
            )
            teacher_id = result.lastrowid
            if teacher_id is None:
                teacher_id = connection.execute(sa.text("SELECT id FROM users WHERE email = 'legacy-content-owner@system.invalid'")).scalar()

        now = datetime.now(timezone.utc)
        result = connection.execute(
            sa.text("INSERT INTO quiz_collections (name, description, created_by, is_published, created_at, updated_at) VALUES (:name, :description, :created_by, :published, :created_at, :updated_at)"),
            {"name": "Imported questions", "description": "Questions from before quiz collections were introduced.", "created_by": teacher_id, "published": True, "created_at": now, "updated_at": now},
        )
        collection_id = result.lastrowid
        if collection_id is None:
            collection_id = connection.execute(sa.text("SELECT id FROM quiz_collections WHERE name = 'Imported questions' AND created_by = :owner ORDER BY id DESC LIMIT 1"), {"owner": teacher_id}).scalar()
    else:
        collection_id = None

    op.add_column("questions", sa.Column("collection_id", sa.Integer(), nullable=True))
    if collection_id is not None:
        connection.execute(sa.text("UPDATE questions SET collection_id = :collection_id"), {"collection_id": collection_id})
    with op.batch_alter_table("questions") as batch:
        batch.alter_column("collection_id", existing_type=sa.Integer(), nullable=False)
        batch.create_foreign_key("fk_questions_collection_id_quiz_collections", "quiz_collections", ["collection_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_questions_collection_id", "questions", ["collection_id"])

    op.add_column("quiz_attempts", sa.Column("collection_id", sa.Integer(), nullable=True))
    with op.batch_alter_table("quiz_attempts") as batch:
        batch.create_foreign_key("fk_quiz_attempts_collection_id_quiz_collections", "quiz_collections", ["collection_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_quiz_attempts_collection_id", "quiz_attempts", ["collection_id"])


def downgrade():
    op.drop_index("ix_quiz_attempts_collection_id", table_name="quiz_attempts")
    with op.batch_alter_table("quiz_attempts") as batch:
        batch.drop_constraint("fk_quiz_attempts_collection_id_quiz_collections", type_="foreignkey")
        batch.drop_column("collection_id")
    op.drop_index("ix_questions_collection_id", table_name="questions")
    with op.batch_alter_table("questions") as batch:
        batch.drop_constraint("fk_questions_collection_id_quiz_collections", type_="foreignkey")
        batch.drop_column("collection_id")
    op.drop_index("ix_quiz_collections_created_by", table_name="quiz_collections")
    op.drop_table("quiz_collections")
