import os
from pathlib import Path
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.config.settings import settings
from app.database.base import Base

# Ensure parent directory exists for SQLite database file
db_path = Path(settings.DATABASE_PATH)
db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Generator for database sessions suitable for FastAPI dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def get_db_context():
    """Context manager for database sessions in services/standalone logic."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def init_db():
    """Initialize database tables automatically on startup."""
    # Import models to ensure they are registered on Base.metadata
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)

# Auto-initialize database tables on connection setup
init_db()
