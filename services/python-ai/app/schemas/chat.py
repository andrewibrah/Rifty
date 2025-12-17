from typing import Any, List, Optional, Union
from pydantic import BaseModel


class Message(BaseModel):
    id: str
    created_at: str
    content: str
    status: Optional[str] = None
    processing: Optional[List[dict]] = None


class EntryMessage(Message):
    kind: str
    type: str
    aiIntent: Optional[str] = None
    aiConfidence: Optional[float] = None
    aiMeta: Optional[dict] = None
    intentMeta: Optional[dict] = None


class BotMessage(Message):
    kind: str
    afterId: str


class QueryMessage(Message):
    kind: str


ChatMessage = Union[EntryMessage, BotMessage, QueryMessage]


class MessageGroup(BaseModel):
    id: str
    messages: List[ChatMessage]
    timestamp: str
    type: str

