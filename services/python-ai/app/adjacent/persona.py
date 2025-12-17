from typing import Literal

from ..schemas.personalization import PersonalizationState

PersonaTag = Literal["Architect", "Explorer", "Anchor", "Accelerator", "Generalist"]


def _is_high(value: float) -> bool:
    return value >= 7


def _has_goals(goals, targets) -> bool:
    return any(goal in targets for goal in goals)


def _cadence_is(cadence: str, target: str) -> bool:
    return cadence == target


def _intensity_matches(intensity: str, targets) -> bool:
    return intensity in targets


def _has_drift_anchor(state: PersonalizationState) -> bool:
    return bool(getattr(state.drift_rule, "enabled", False) and getattr(state.drift_rule, "after", None))


def _has_crisis_note(state: PersonalizationState) -> bool:
    return bool(getattr(state, "crisis_card", None) and str(state.crisis_card).strip())


def _is_lower_bluntness(value: float) -> bool:
    return value <= 4


def compute_persona_tag(state: PersonalizationState) -> PersonaTag:
    visual_score = state.learning_style.visual
    kinesthetic_score = state.learning_style.kinesthetic
    auditory_score = state.learning_style.auditory
    bluntness = state.bluntness
    cadence = state.cadence
    intensity = state.language_intensity
    goals = state.goals
    session_length = state.session_length_minutes

    if _is_high(visual_score) and _is_high(kinesthetic_score) and _intensity_matches(intensity, ["direct"]) and _cadence_is(cadence, "daily"):
        return "Architect"

    if _is_high(auditory_score) and _intensity_matches(intensity, ["soft", "neutral"]) and _cadence_is(cadence, "weekly"):
        return "Explorer"

    if _has_drift_anchor(state) and _has_crisis_note(state) and _is_lower_bluntness(bluntness):
        return "Anchor"

    if bluntness >= 8 and 10 <= session_length <= 25 and _has_goals(goals, ["execution", "performance"]):
        return "Accelerator"

    return "Generalist"

