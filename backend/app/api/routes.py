from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user, get_db, student_required, teacher_required
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Question, QuizAnswer, QuizAttempt, QuizCollection, Role, User
from app.schemas.collection import CollectionInput, CollectionOut
from app.schemas.auth import LoginInput, RegisterInput, TokenOut, UserOut
from app.schemas.question import QuestionInput, QuestionOut, QuizQuestionOut
from app.schemas.quiz import AnswerFeedbackInput, AnswerFeedbackOut, AnswerResult, AttemptOut, AttemptSummary, QuizSubmitInput

router = APIRouter()


def teacher_collection(collection_id: int, user: User, db: Session) -> QuizCollection:
    collection = db.scalar(select(QuizCollection).where(QuizCollection.id == collection_id, QuizCollection.created_by == user.id))
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def student_collection(collection_id: int, db: Session) -> QuizCollection:
    collection = db.scalar(select(QuizCollection).where(QuizCollection.id == collection_id, QuizCollection.is_published.is_(True)))
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def collection_payload(collection: QuizCollection) -> CollectionOut:
    return CollectionOut(
        id=collection.id, name=collection.name, description=collection.description,
        created_by=collection.created_by, is_published=collection.is_published,
        created_at=collection.created_at, updated_at=collection.updated_at,
        question_count=len(collection.questions),
    )


@router.get("/collections", response_model=list[CollectionOut])
def list_collections(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(QuizCollection).options(selectinload(QuizCollection.questions)).order_by(QuizCollection.created_at.desc(), QuizCollection.id.desc())
    if user.role == Role.teacher:
        query = query.where(QuizCollection.created_by == user.id)
    else:
        query = query.where(QuizCollection.is_published.is_(True))
    return [collection_payload(c) for c in db.scalars(query).all()]


@router.post("/collections", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
def create_collection(payload: CollectionInput, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    collection = QuizCollection(**payload.model_dump(), created_by=user.id)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return collection_payload(collection)


@router.put("/collections/{collection_id}", response_model=CollectionOut)
def update_collection(collection_id: int, payload: CollectionInput, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    collection = teacher_collection(collection_id, user, db)
    for key, value in payload.model_dump().items():
        setattr(collection, key, value)
    db.commit()
    db.refresh(collection)
    return collection_payload(collection)


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: int, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    collection = teacher_collection(collection_id, user, db)
    has_history = db.scalar(select(QuizAnswer.id).join(Question).where(Question.collection_id == collection.id).limit(1))
    if has_history:
        raise HTTPException(status_code=409, detail="This collection contains questions used in quiz history and cannot be deleted")
    db.delete(collection)
    db.commit()


@router.get("/collections/{collection_id}/questions", response_model=list[QuestionOut])
def list_collection_questions(collection_id: int, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    teacher_collection(collection_id, user, db)
    return list(db.scalars(select(Question).where(Question.collection_id == collection_id).order_by(Question.created_at.desc(), Question.id.desc())))


@router.post("/collections/{collection_id}/questions", response_model=QuestionOut, status_code=status.HTTP_201_CREATED)
def create_collection_question(collection_id: int, payload: QuestionInput, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    teacher_collection(collection_id, user, db)
    question = Question(**payload.model_dump(), collection_id=collection_id)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.put("/collections/{collection_id}/questions/{question_id}", response_model=QuestionOut)
def add_existing_question(collection_id: int, question_id: int, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    teacher_collection(collection_id, user, db)
    question = db.scalar(select(Question).join(QuizCollection).where(Question.id == question_id, QuizCollection.created_by == user.id))
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.collection_id != collection_id and db.scalar(select(QuizAnswer.id).where(QuizAnswer.question_id == question_id).limit(1)):
        raise HTTPException(status_code=409, detail="A question used in quiz history cannot be moved")
    question.collection_id = collection_id
    db.commit()
    db.refresh(question)
    return question


@router.get("/collections/{collection_id}/quiz", response_model=list[QuizQuestionOut])
def collection_quiz(collection_id: int, _: User = Depends(student_required), db: Session = Depends(get_db)):
    student_collection(collection_id, db)
    questions = db.scalars(select(Question).where(Question.collection_id == collection_id).order_by(Question.id)).all()
    return [QuizQuestionOut.from_question(q) for q in questions]


@router.post("/auth/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterInput, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email is already registered")
    user = User(email=email, full_name=payload.full_name.strip(), password_hash=hash_password(payload.password), role=Role.student)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/auth/login", response_model=TokenOut)
def login(payload: LoginInput, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    return TokenOut(access_token=create_access_token(user.id), user=user)


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/teacher/questions", response_model=list[QuestionOut])
def list_questions(user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    return list(db.scalars(select(Question).join(QuizCollection).where(QuizCollection.created_by == user.id).order_by(Question.created_at.desc(), Question.id.desc())))


@router.post("/teacher/questions", response_model=QuestionOut, status_code=status.HTTP_201_CREATED)
def create_question(payload: QuestionInput, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    # Backward-compatible endpoint: legacy callers place questions in a teacher-owned General collection.
    collection = db.scalar(select(QuizCollection).where(QuizCollection.created_by == user.id, QuizCollection.name == "General"))
    if not collection:
        collection = QuizCollection(name="General", created_by=user.id, is_published=True)
        db.add(collection)
        db.flush()
    question = Question(**payload.model_dump(), collection_id=collection.id)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.get("/teacher/questions/{question_id}", response_model=QuestionOut)
def get_question(question_id: int, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    question = db.scalar(select(Question).join(QuizCollection).where(Question.id == question_id, QuizCollection.created_by == user.id))
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.put("/teacher/questions/{question_id}", response_model=QuestionOut)
def update_question(question_id: int, payload: QuestionInput, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    question = db.scalar(select(Question).join(QuizCollection).where(Question.id == question_id, QuizCollection.created_by == user.id))
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    for key, value in payload.model_dump().items():
        setattr(question, key, value)
    db.commit()
    db.refresh(question)
    return question


@router.delete("/teacher/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(question_id: int, user: User = Depends(teacher_required), db: Session = Depends(get_db)):
    question = db.scalar(select(Question).join(QuizCollection).where(Question.id == question_id, QuizCollection.created_by == user.id))
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if db.scalar(select(QuizAnswer.id).where(QuizAnswer.question_id == question_id).limit(1)):
        raise HTTPException(status_code=409, detail="Question is part of a submitted attempt and cannot be deleted")
    db.delete(question)
    db.commit()


@router.get("/quiz/questions", response_model=list[QuizQuestionOut])
def quiz_questions(_: User = Depends(student_required), db: Session = Depends(get_db)):
    questions = db.scalars(select(Question).join(QuizCollection).where(QuizCollection.is_published.is_(True)).order_by(Question.id)).all()
    return [QuizQuestionOut.from_question(q) for q in questions]


@router.post("/quiz/answer-feedback", response_model=AnswerFeedbackOut)
def answer_feedback(payload: AnswerFeedbackInput, _: User = Depends(student_required), db: Session = Depends(get_db)):
    question = db.scalar(select(Question).options(selectinload(Question.collection)).where(Question.id == payload.question_id))
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if payload.collection_id is not None:
        student_collection(payload.collection_id, db)
        if question.collection_id != payload.collection_id:
            raise HTTPException(status_code=404, detail="Question not found")
    elif not question.collection.is_published:
        raise HTTPException(status_code=404, detail="Question not found")
    return AnswerFeedbackOut(
        question_id=question.id,
        selected_answer=payload.selected_answer,
        is_correct=question.correct_answer == payload.selected_answer,
        correct_answer=question.correct_answer,
        explanation=question.explanation,
    )


def score_quiz(payload: QuizSubmitInput, user: User, db: Session, collection_id: Optional[int] = None) -> AttemptOut:
    ids = [answer.question_id for answer in payload.answers]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="Each question may be answered only once")
    if collection_id is not None:
        collection = student_collection(collection_id, db)
        question_query = select(Question).where(Question.collection_id == collection.id)
    else:
        collection = None
        question_query = select(Question).join(QuizCollection).where(QuizCollection.is_published.is_(True))
    questions = {q.id: q for q in db.scalars(question_query).all()}
    if set(ids) != set(questions):
        raise HTTPException(status_code=422, detail="Submit exactly one answer for every available question")
    correct_count = sum(questions[a.question_id].correct_answer == a.selected_answer for a in payload.answers)
    attempt = QuizAttempt(student_id=user.id, collection_id=collection_id, total_questions=len(ids), correct_count=correct_count, score_percent=round(correct_count / len(ids) * 100, 2))
    db.add(attempt)
    db.flush()
    results = []
    for answer in payload.answers:
        q = questions[answer.question_id]
        is_correct = q.correct_answer == answer.selected_answer
        snapshot = {"content": q.content, "option_a": q.option_a, "option_b": q.option_b, "option_c": q.option_c, "option_d": q.option_d, "correct_answer": q.correct_answer, "explanation": q.explanation}
        db.add(QuizAnswer(attempt_id=attempt.id, question_id=q.id, selected_answer=answer.selected_answer, is_correct=is_correct, question_snapshot=snapshot))
        results.append(AnswerResult(question_id=q.id, content=q.content, option_a=q.option_a, option_b=q.option_b, option_c=q.option_c, option_d=q.option_d, selected_answer=answer.selected_answer, correct_answer=q.correct_answer, is_correct=is_correct, explanation=q.explanation))
    db.commit()
    db.refresh(attempt)
    return AttemptOut(id=attempt.id, collection_id=collection_id, collection_name=collection.name if collection else None, total_questions=attempt.total_questions, correct_count=attempt.correct_count, incorrect_count=attempt.total_questions-attempt.correct_count, score_percent=attempt.score_percent, submitted_at=attempt.submitted_at, answers=results)


@router.post("/quiz/submit", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def submit_quiz(payload: QuizSubmitInput, user: User = Depends(student_required), db: Session = Depends(get_db)):
    return score_quiz(payload, user, db)


@router.post("/collections/{collection_id}/submit", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def submit_collection_quiz(collection_id: int, payload: QuizSubmitInput, user: User = Depends(student_required), db: Session = Depends(get_db)):
    return score_quiz(payload, user, db, collection_id)


def serialize_attempt(attempt: QuizAttempt) -> AttemptOut:
    answers = [AnswerResult(question_id=a.question_id, content=(a.question_snapshot or {}).get("content", a.question.content), option_a=(a.question_snapshot or {}).get("option_a", a.question.option_a), option_b=(a.question_snapshot or {}).get("option_b", a.question.option_b), option_c=(a.question_snapshot or {}).get("option_c", a.question.option_c), option_d=(a.question_snapshot or {}).get("option_d", a.question.option_d), selected_answer=a.selected_answer, correct_answer=(a.question_snapshot or {}).get("correct_answer", a.question.correct_answer), is_correct=a.is_correct, explanation=(a.question_snapshot or {}).get("explanation", a.question.explanation)) for a in attempt.answers]
    return AttemptOut(id=attempt.id, collection_id=attempt.collection_id, collection_name=attempt.collection.name if attempt.collection else None, total_questions=attempt.total_questions, correct_count=attempt.correct_count, incorrect_count=attempt.total_questions-attempt.correct_count, score_percent=attempt.score_percent, submitted_at=attempt.submitted_at, answers=answers)


@router.get("/quiz/history", response_model=list[AttemptSummary])
def quiz_history(user: User = Depends(student_required), db: Session = Depends(get_db)):
    attempts = db.scalars(select(QuizAttempt).options(selectinload(QuizAttempt.collection)).where(QuizAttempt.student_id == user.id).order_by(QuizAttempt.submitted_at.desc())).all()
    return [AttemptSummary(id=a.id, collection_id=a.collection_id, collection_name=a.collection.name if a.collection else None, total_questions=a.total_questions, correct_count=a.correct_count, score_percent=a.score_percent, submitted_at=a.submitted_at) for a in attempts]


@router.get("/quiz/attempts/{attempt_id}", response_model=AttemptOut)
def get_attempt(attempt_id: int, user: User = Depends(student_required), db: Session = Depends(get_db)):
    attempt = db.scalar(select(QuizAttempt).where(QuizAttempt.id == attempt_id, QuizAttempt.student_id == user.id).options(selectinload(QuizAttempt.collection), selectinload(QuizAttempt.answers).selectinload(QuizAnswer.question)))
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return serialize_attempt(attempt)
