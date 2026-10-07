from pydantic import BaseModel


class ChatMessage(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    tool_calls: list[str] = []
