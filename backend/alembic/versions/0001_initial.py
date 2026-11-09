"""Create quiz schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

role_enum = sa.Enum("teacher", "student", name="role")

def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql": role_enum.create(bind, checkfirst=True)
    op.create_table("users",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(120), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", role_enum, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("questions",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("content", sa.Text(), nullable=False),
        sa.Column("option_a", sa.Text(), nullable=False), sa.Column("option_b", sa.Text(), nullable=False),
        sa.Column("option_c", sa.Text(), nullable=False), sa.Column("option_d", sa.Text(), nullable=False),
        sa.Column("correct_answer", sa.String(1), nullable=False), sa.Column("explanation", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("quiz_attempts",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False), sa.Column("correct_count", sa.Integer(), nullable=False),
        sa.Column("score_percent", sa.Float(), nullable=False), sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_quiz_attempts_student_id", "quiz_attempts", ["student_id"])
    op.create_table("quiz_answers",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("attempt_id", sa.Integer(), sa.ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("selected_answer", sa.String(1), nullable=False), sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question"))
    op.create_index("ix_quiz_answers_attempt_id", "quiz_answers", ["attempt_id"])

def downgrade():
    op.drop_index("ix_quiz_answers_attempt_id", table_name="quiz_answers")
    op.drop_table("quiz_answers")
    op.drop_index("ix_quiz_attempts_student_id", table_name="quiz_attempts")
    op.drop_table("quiz_attempts")
    op.drop_table("questions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    if op.get_bind().dialect.name == "postgresql": role_enum.drop(op.get_bind(), checkfirst=True)
