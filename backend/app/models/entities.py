import enum
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    teacher = "teacher"
    student = "student"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.student)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    attempts: Mapped[list["QuizAttempt"]] = relationship(back_populates="student", cascade="all, delete-orphan")
    collections: Mapped[list["QuizCollection"]] = relationship(back_populates="creator", cascade="all, delete-orphan")


class QuizCollection(Base):
    __tablename__ = "quiz_collections"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    creator: Mapped[User] = relationship(back_populates="collections")
    questions: Mapped[list["Question"]] = relationship(back_populates="collection", cascade="all, delete-orphan")
    attempts: Mapped[list["QuizAttempt"]] = relationship(back_populates="collection")


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    collection_id: Mapped[int] = mapped_column(ForeignKey("quiz_collections.id", ondelete="CASCADE"), index=True)
    content: Mapped[dict[str, Any]] = mapped_column(JSON)
    option_a: Mapped[dict[str, Any]] = mapped_column(JSON)
    option_b: Mapped[dict[str, Any]] = mapped_column(JSON)
    option_c: Mapped[dict[str, Any]] = mapped_column(JSON)
    option_d: Mapped[dict[str, Any]] = mapped_column(JSON)
    correct_answer: Mapped[str] = mapped_column(String(1))
    explanation: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    answers: Mapped[list["QuizAnswer"]] = relationship(back_populates="question")
    collection: Mapped[QuizCollection] = relationship(back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    collection_id: Mapped[Optional[int]] = mapped_column(ForeignKey("quiz_collections.id", ondelete="SET NULL"), nullable=True, index=True)
    total_questions: Mapped[int] = mapped_column(Integer)
    correct_count: Mapped[int] = mapped_column(Integer)
    score_percent: Mapped[float] = mapped_column()
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    student: Mapped[User] = relationship(back_populates="attempts")
    collection: Mapped[Optional[QuizCollection]] = relationship(back_populates="attempts")
    answers: Mapped[list["QuizAnswer"]] = relationship(back_populates="attempt", cascade="all, delete-orphan")


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("quiz_attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"))
    selected_answer: Mapped[str] = mapped_column(String(1))
    is_correct: Mapped[bool] = mapped_column()
    question_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    attempt: Mapped[QuizAttempt] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship(back_populates="answers")
