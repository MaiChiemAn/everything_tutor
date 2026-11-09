import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.api.deps import get_db
from app.db.base import Base
from app.main import app
from app.core.security import hash_password
from app.models import Role, User

@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)
    db = TestingSession()
    db.add_all([
        User(email="teacher@example.com", full_name="Teacher", password_hash=hash_password("teacher-pass-123"), role=Role.teacher),
        User(email="student@example.com", full_name="Student", password_hash=hash_password("student-pass-123"), role=Role.student),
    ])
    db.commit()
    db.close()
    def override_db():
        session = TestingSession()
        try: yield session
        finally: session.close()
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)

def token(client, email, password):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]

@pytest.fixture
def auth_tokens(client):
    return {"teacher": token(client, "teacher@example.com", "teacher-pass-123"), "student": token(client, "student@example.com", "student-pass-123")}
