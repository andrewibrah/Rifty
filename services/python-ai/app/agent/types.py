from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel

from ..schemas.goal import GoalContextItem

EntryType = Literal["journal", "goal", "schedule"]


class RoutedIntent(BaseModel):
    label: str
    rawLabel: str
    confidence: float
    secondBest: Optional[str] = None
    secondConfidence: Optional[float] = None
    slots: Dict[str, str]
    topK: List[Dict[str, Any]]
    modelVersion: Optional[str] = None
    matchedTokens: Optional[List[Dict[str, Any]]] = None
    tokens: Optional[List[str]] = None


class RouteDecision(BaseModel):
    kind: Literal["commit", "clarify", "fallback"]
    primary: Optional[str] = None
    maybeSecondary: Optional[str] = None
    question: Optional[str] = None


class PlannerResponse(BaseModel):
    action: str
    ask: Optional[str]
    payload: Dict[str, Any]


class ClassificationDuplicate(BaseModel):
    id: str
    score: float
    text: str
    kind: str


class ClassificationCandidate(BaseModel):
    label: str
    confidence: float


class ClassificationMeta(BaseModel):
    id: str
    label: str
    confidence: float
    reasons: List[str]
    targetEntryId: Optional[str] = None
    targetEntryType: Optional[str] = None
    duplicateMatch: Optional[ClassificationDuplicate] = None
    topCandidates: List[ClassificationCandidate]


class EnrichedPayload(BaseModel):
    userText: str
    intent: RoutedIntent
    contextSnippets: List[str]
    userConfig: Dict[str, Any]
    goalContext: Optional[List[GoalContextItem]] = None
    coachingSuggestion: Optional[Dict[str, Any]] = None
    classification: Optional[ClassificationMeta] = None


class RedactionResult(BaseModel):
    masked: str
    replacementMap: Dict[str, str]

