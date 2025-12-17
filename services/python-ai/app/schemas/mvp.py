from typing import Any, List, Optional
from pydantic import BaseModel


class EntrySummary(BaseModel):
    id: str
    entry_id: str
    user_id: str
    summary: str
    emotion: Optional[str] = None
    topics: List[str]
    people: List[str]
    urgency_level: Optional[float] = None
    suggested_action: Optional[str] = None
    blockers: Optional[str] = None
    dates_mentioned: Optional[List[str]] = None
    created_at: str
    updated_at: str


class EntryEmbedding(BaseModel):
    id: str
    entry_id: str
    user_id: str
    embedding: List[float]
    model: str
    created_at: str


class SimilarEntry(BaseModel):
    entry_id: str
    similarity: float
    entry: Optional[Any] = None


class UserFact(BaseModel):
    id: str
    user_id: str
    fact: str
    category: Optional[str] = None
    confidence: float
    source_entry_ids: List[str]
    last_confirmed_at: Optional[str] = None
    created_at: str
    updated_at: str


class CheckIn(BaseModel):
    id: str
    user_id: str
    type: str
    prompt: str
    response: Optional[str] = None
    response_entry_id: Optional[str] = None
    scheduled_for: str
    completed_at: Optional[str] = None
    created_at: str


class SummarizeEntryResult(BaseModel):
    summary: str
    emotion: Optional[str] = None
    topics: Optional[List[str]] = None
    people: Optional[List[str]] = None
    urgency_level: Optional[float] = None
    suggested_action: Optional[str] = None
    blockers: Optional[str] = None
    dates_mentioned: Optional[List[str]] = None
    reflection: str


class AnalystQueryResult(BaseModel):
    answer: str
    citations: List[dict]
    relevant_facts: Optional[List[str]] = None


class GoalDetectionResult(BaseModel):
    goal_detected: bool
    suggested_title: Optional[str] = None
    suggested_description: Optional[str] = None
    suggested_category: Optional[str] = None
    suggested_micro_steps: Optional[List[str]] = None


class WeeklyReviewData(BaseModel):
    themes: List[str]
    top_blockers: List[str]
    progress_on_goals: List[dict]
    focus_note: str

