from typing import Dict, Optional
from pydantic import BaseModel


class IntentDefinition(BaseModel):
    id: str
    label: str
    subsystem: str
    entryType: Optional[str] = None
    allowedInEntryChat: bool


class ProcessingStep(BaseModel):
    id: str
    label: str
    status: str
    detail: Optional[str] = None
    timestamp: Optional[str] = None


class IntentPredictionResult(IntentDefinition):
    rawLabel: str
    confidence: float
    probabilities: Dict[str, float]


class IntentMetadata(BaseModel):
    id: str
    rawLabel: str
    displayLabel: str
    confidence: float
    subsystem: str
    probabilities: Dict[str, float]


class EntryNotePayload(BaseModel):
    noteTitle: str
    noteBody: str
    searchTag: str
    guidance: str

