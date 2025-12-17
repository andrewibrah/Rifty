from typing import List, Optional
from pydantic import BaseModel, Field


class MicroStep(BaseModel):
    id: str
    description: str
    completed: bool
    completed_at: Optional[str] = None


class Goal(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    target_date: Optional[str] = Field(default=None)
    status: str
    current_step: Optional[str] = None
    micro_steps: List[MicroStep]
    source_entry_id: Optional[str] = None
    metadata: dict
    embedding: Optional[List[float]] = None
    created_at: str
    updated_at: str


class GoalReflection(BaseModel):
    id: str
    user_id: str
    goal_id: str
    entry_id: str
    alignment_score: float
    emotion: dict
    note: Optional[str] = None
    created_at: str


class GoalProgressCache(BaseModel):
    goal_id: str
    progress_pct: float
    coherence_score: float
    ghi_state: str
    last_computed_at: str


class AIGoalSession(BaseModel):
    id: str
    user_id: str
    goal_id: Optional[str] = None
    utterance: str
    response_summary: Optional[str] = None
    created_at: str


class GoalAnchor(BaseModel):
    id: str
    user_id: str
    goal_id: str
    anchor_type: str
    scheduled_for: str
    completed_at: Optional[str] = None
    metadata: dict
    created_at: str


class GoalContextLinkedEntry(BaseModel):
    id: str
    created_at: str
    snippet: str


class GoalProgress(BaseModel):
    completed: int
    total: int
    ratio: float


class GoalContextItem(BaseModel):
    id: str
    title: str
    status: str
    priority_score: float
    target_date: Optional[str] = None
    current_step: Optional[str] = None
    micro_steps: List[MicroStep]
    progress: GoalProgress
    description: Optional[str] = None
    updated_at: Optional[str] = None
    metadata: dict
    source_entry_id: Optional[str] = None
    conflicts: List[str]
    linked_entries: List[GoalContextLinkedEntry]
