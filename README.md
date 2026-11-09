# PyPractice — Python Programming Quiz

A responsive React application backed by FastAPI, SQLAlchemy, and PostgreSQL. It supports teacher question management and student quiz attempts with server-calculated scores.

## Project layout

- `backend/` — FastAPI app, SQLAlchemy models, Alembic migrations, and API tests
- `frontend/` — Vite + React + TypeScript + Tailwind CSS

## Backend setup

Python 3.9+ is supported. From `backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `DATABASE_URL` and a strong `SECRET_KEY` in `.env`. For local development, SQLite works by setting `DATABASE_URL=sqlite:///./quiz.db`. For PostgreSQL, create a database and set a URL such as `postgresql+psycopg://quiz:password@localhost:5432/python_quiz`.

Apply schema migrations and start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

The interactive API reference is at <http://localhost:8000/docs>; health check at `/health`.

Question text, each answer option, and explanations are stored as structured TipTap JSON documents. The editor includes common text formatting plus CodeMirror 6 code blocks (Python by default), with syntax highlighting, indentation, line numbers, and copy support. The `0003_rich_text` migration converts existing plain text into structured paragraph documents.

Question write endpoints accept a TipTap document for `content`, `option_a` through `option_d`, and `explanation` (which may be `null`). For example:

```json
{
  "type": "doc",
  "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "What does this print?"}]},
    {"type": "codeBlock", "attrs": {"language": "python"}, "content": [{"type": "text", "text": "print(2 + 2)"}]}
  ]
}
```

Public registration creates student accounts only. Provision a teacher account from the trusted backend directory with `python create_teacher.py`; it prompts for the name, email, and password. Do not expose teacher registration to untrusted clients.

## Frontend setup

From `frontend/`:

```bash
npm install
npm run dev
```

The app runs at <http://localhost:5173>. Set `VITE_API_URL` if the backend is not at `http://localhost:8000/api`. Add the frontend origin to backend `CORS_ORIGINS`.

## Tests

From `backend/`, after installing requirements:

```bash
pytest
```

The tests cover registration/login, teacher-only question management, answer key hiding, server-side scoring, attempt ownership, and requiring one answer per available question.

## API summary

All routes are under `/api` and protected routes use `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a student |
| POST | `/auth/login` | Public | Issue an access token |
| GET | `/auth/me` | Authenticated | Current user |
| POST | `/collections` | Teacher | Create a collection (published by default) |
| GET | `/collections` | Teacher / student | List owned collections for teachers and published collections for students |
| PUT, DELETE | `/collections/{id}` | Owning teacher | Update or delete a collection |
| GET, POST | `/collections/{id}/questions` | Owning teacher | List and create questions in a collection |
| PUT | `/collections/{id}/questions/{question_id}` | Owning teacher | Move an existing question into a collection, if it has no quiz history |
| GET | `/collections/{id}/quiz` | Student | Load published collection questions without answer keys |
| POST | `/collections/{id}/submit` | Student | Score and save a collection attempt on the backend |
| GET, POST | `/teacher/questions` | Teacher | List and create questions |
| GET, PUT, DELETE | `/teacher/questions/{id}` | Teacher | Read, update, and delete a question |
| GET | `/quiz/questions` | Student | Questions without answer keys |
| POST | `/quiz/answer-feedback` | Student | Check a selected answer and return immediate feedback |
| POST | `/quiz/submit` | Student | Submit answers; score computed and attempt saved on server |
| GET | `/quiz/history` | Student | List the current student's attempts |
| GET | `/quiz/attempts/{id}` | Owning student | Review an attempt |

## Data model

Users have a teacher or student role. Teachers own quiz collections and their questions. Each collection has a name, optional description, publication status, and timestamps. Questions store their collection, four options, correct choice, and optional explanation. Quiz attempts belong to a student and collection, and contain the backend-calculated score. Quiz answers store each submitted choice and correctness, with one answer per question per attempt. Collections and questions used in saved attempts cannot be deleted so attempt review remains intact; empty collections and questions without attempt history are deleted with their parent collection.

## Security notes

- Student registration cannot select a role.
- Passwords are hashed; JWTs are signed using `SECRET_KEY` and expire according to configuration.
- Teacher and student permissions are checked on every protected API route.
- Quiz retrieval omits correct answers; scoring uses database values on submission.
- Interactive answer feedback returns correctness after the student selects an option; answer choices stay out of the question list response.
- Each student can only read their own attempt history and results.
- Teachers can only view and manage collections and questions they own. Students only see published collections.
- Quiz answer state is held in a reducer by question ID for the duration of the session. The question picker shows unanswered, correct, and incorrect states; only selected choices are sent for final scoring.
