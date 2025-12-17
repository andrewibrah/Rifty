from typing import Dict, List, Optional
from pydantic import BaseModel


class LearningStyle(BaseModel):
    visual: float
    auditory: float
    kinesthetic: float


class DriftRule(BaseModel):
    enabled: bool
    after: Optional[str] = None


class UserSettings(BaseModel):
    user_id: Optional[str] = None
    personalization_mode: str
    local_cache_enabled: bool
    cadence: str
    goals: List[str]
    extra_goal: Optional[str] = None
    learning_style: LearningStyle
    session_length_minutes: int
    spiritual_prompts: bool
    bluntness: int
    language_intensity: str
    logging_format: str
    drift_rule: DriftRule
    crisis_card: Optional[str] = None
    persona_tag: str
    checkin_notifications: Optional[bool] = None
    missed_day_notifications: Optional[bool] = None
    updated_at: Optional[str] = None
    created_at: Optional[str] = None


class PersonaSignalPayload(BaseModel):
    source: str
    rationale: str
    changes: Dict[str, object]


class ProfileSnapshot(BaseModel):
    id: str
    timezone: str
    onboarding_completed: bool
    updated_at: Optional[str] = None
    missed_day_count: Optional[int] = None
    current_streak: Optional[int] = None
    last_message_at: Optional[str] = None


class PersonalizationRuntime(BaseModel):
    user_settings: Optional[UserSettings] = None
    persona: Optional[str] = None
    cadence: str
    tone: str
    spiritual_on: bool
    bluntness: int
    privacy_gates: Dict[str, bool]
    crisis_rules: Dict[str, object]
    resolved_at: str


class PersonalizationBundle(PersonalizationRuntime):
    profile: ProfileSnapshot
    settings: Optional[UserSettings] = None


class PersonalizationState(BaseModel):
    personalization_mode: str
    local_cache_enabled: bool
    cadence: str
    goals: List[str]
    extra_goal: Optional[str] = None
    learning_style: LearningStyle
    session_length_minutes: int
    spiritual_prompts: bool
    bluntness: int
    language_intensity: str
    logging_format: str
    drift_rule: DriftRule
    crisis_card: Optional[str] = None
    persona_tag: Optional[str] = None
    checkin_notifications: Optional[bool] = None
    missed_day_notifications: Optional[bool] = None
    updated_at: Optional[str] = None
    created_at: Optional[str] = None


class CachedPersonalization(BaseModel):
    settings: UserSettings
    updated_at: str
