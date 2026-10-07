from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.shopping_agent import run_shopping_agent
from app.database import get_db
from app.memory.conversation import load_history, save_turn
from app.models.user import User
from app.schemas.chat import ChatMessage, ChatResponse
from app.services.deps import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(payload: ChatMessage, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    history = load_history(db, current_user.id, payload.session_id)

    try:
        result = run_shopping_agent(db, current_user, history, payload.message)
    except RuntimeError as e:
        # e.g. missing ANTHROPIC_API_KEY - surface a clear, actionable error
        raise HTTPException(status_code=503, detail=str(e))

    save_turn(db, current_user.id, payload.session_id, "user", payload.message)
    save_turn(db, current_user.id, payload.session_id, "assistant", result["reply"])

    return ChatResponse(session_id=payload.session_id, reply=result["reply"], tool_calls=result["tool_calls"])
