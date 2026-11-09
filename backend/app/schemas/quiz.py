from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.schemas.question import RichDocument


class AnswerInput(BaseModel):
    question_id: int = Field(gt=0)
    selected_answer: Literal["A", "B", "C", "D"]


class QuizSubmitInput(BaseModel):
    answers: list[AnswerInput] = Field(min_length=1, max_length=200)


class AnswerFeedbackInput(BaseModel):
    collection_id: Optional[int] = Field(default=None, gt=0)
    question_id: int = Field(gt=0)
    selected_answer: Literal["A", "B", "C", "D"]


class AnswerFeedbackOut(BaseModel):
    question_id: int
    selected_answer: str
    is_correct: bool
    correct_answer: str
    explanation: Optional[RichDocument]


class AnswerResult(BaseModel):
    question_id: int
    content: RichDocument
    option_a: RichDocument
    option_b: RichDocument
    option_c: RichDocument
    option_d: RichDocument
    selected_answer: str
    correct_answer: str
    is_correct: bool
    explanation: Optional[RichDocument]


class AttemptOut(BaseModel):
    id: int
    collection_id: Optional[int]
    collection_name: Optional[str]
    total_questions: int
    correct_count: int
    incorrect_count: int
    score_percent: float
    submitted_at: datetime
    answers: list[AnswerResult]


class AttemptSummary(BaseModel):
    id: int
    collection_id: Optional[int]
    collection_name: Optional[str]
    total_questions: int
    correct_count: int
    score_percent: float
    submitted_at: datetime
