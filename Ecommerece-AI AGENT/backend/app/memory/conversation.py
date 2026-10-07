"""
Conversation memory backed by the `conversations` table.

Each chat turn (customer message, assistant reply) is persisted per
session_id so the agent can be re-given the recent history on the next
turn, and so admins can review AI conversation logs. This keeps memory
durable across server restarts, unlike an in-process dict.
"""
from sqlalchemy.orm import Session

from app.models.order import Conversation

MAX_HISTORY_TURNS = 12


def load_history(db: Session, user_id: int, session_id: str) -> list[dict]:
    rows = (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id, Conversation.session_id == session_id)
        .order_by(Conversation.created_at.asc())
        .limit(MAX_HISTORY_TURNS * 2)
        .all()
    )
    return [{"role": r.role, "content": r.content} for r in rows]


def save_turn(db: Session, user_id: int, session_id: str, role: str, content: str) -> None:
    db.add(Conversation(user_id=user_id, session_id=session_id, role=role, content=content[:4000]))
    db.commit()
