from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ..schemas.personalization import CachedPersonalization, PersonalizationBundle, PersonalizationRuntime, PersonalizationState, PersonaSignalPayload, ProfileSnapshot, UserSettings
from ..adjacent.persona import compute_persona_tag

_cached_settings: Optional[UserSettings] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fallback_profile(user_id: str) -> ProfileSnapshot:
    return ProfileSnapshot(
        id=user_id,
        timezone="UTC",
        onboarding_completed=False,
        updated_at=_now_iso(),
        missed_day_count=0,
        current_streak=0,
        last_message_at=None,
    )


def _build_runtime(settings: Optional[UserSettings], feature_map: Optional[Dict[str, Any]] = None) -> PersonalizationRuntime:
    gates = feature_map.get("privacy_gates") if feature_map else {}
    crisis = feature_map.get("crisis_rules") if feature_map else {}
    return PersonalizationRuntime(
        user_settings=settings,
        persona=settings.persona_tag if settings and settings.persona_tag else None,
        cadence=settings.cadence if settings else "none",
        tone=settings.language_intensity if settings else "neutral",
        spiritual_on=bool(settings.spiritual_prompts) if settings else False,
        bluntness=settings.bluntness if settings else 5,
        privacy_gates=gates if isinstance(gates, dict) else {},
        crisis_rules=crisis if isinstance(crisis, dict) else {},
        resolved_at=_now_iso(),
    )


def fetch_personalization_bundle(uid: Optional[str] = None) -> Optional[PersonalizationBundle]:
    user_id = uid or "user-stub"
    settings = _cached_settings
    runtime = _build_runtime(settings)
    profile = _fallback_profile(user_id)
    return PersonalizationBundle(**{**runtime.model_dump(), "profile": profile, "settings": settings})


def persist_personalization(state: PersonalizationState, options: Dict[str, Any]) -> str:
    persona_tag = compute_persona_tag(state)
    updated_settings = UserSettings(**{**state.model_dump(), "persona_tag": persona_tag, "user_id": ""})
    globals()["_cached_settings"] = updated_settings
    return persona_tag


def export_personalization() -> str:
    bundle = fetch_personalization_bundle()
    return bundle.json(indent=2) if bundle else "{}"

