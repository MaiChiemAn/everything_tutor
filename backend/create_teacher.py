"""Create a teacher account from a trusted terminal: python create_teacher.py"""
from getpass import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Role, User

email = input("Teacher email: ").strip().lower()
full_name = input("Teacher name: ").strip()
password = getpass("Password (8+ characters): ")
if len(password) < 8:
    raise SystemExit("Password must be at least 8 characters")
if len(password) > 128:
    raise SystemExit("Password must be no more than 128 characters")

with SessionLocal() as db:
    if db.scalar(select(User).where(User.email == email)):
        raise SystemExit("That email is already registered")
    db.add(User(email=email, full_name=full_name, password_hash=hash_password(password), role=Role.teacher))
    db.commit()
print(f"Teacher account created for {email}")
