"""
SQLAlchemy engine, session factory, and declarative base.

Works against SQLite out of the box (for local dev / this demo) and
against Postgres in production by simply changing DATABASE_URL - no
code changes required, since we avoid SQLite-only or Postgres-only
column types anywhere in the models.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Some hosts hand out "postgres://" URLs; SQLAlchemy 2 needs "postgresql://".
DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
