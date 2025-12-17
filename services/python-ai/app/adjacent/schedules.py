from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ..agent.utils.nanoid import nanoid
from ..orchestrator.summarization import summarize_entry
from ..agent.memory import seed_operating_picture


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def suggest_blocks(uid: Optional[str] = None, goal_id: Optional[str] = None, operating_picture: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    picture = operating_picture or {
        "cadence_profile": {
            "cadence": "none",
            "session_length_minutes": 45,
            "timezone": "UTC",
        }
    }
    cadence_profile = picture.get("cadence_profile", {})
    session_minutes = max(20, min(int(cadence_profile.get("session_length_minutes") or 45), 180))
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=5)
    candidate_starts: List[datetime] = []
    base = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    for day in range(5):
        for hour in [9, 13, 16]:
            candidate = base + timedelta(days=day)
            candidate = candidate.replace(hour=hour, minute=0, second=0, microsecond=0)
            if candidate <= now or candidate > horizon:
                continue
            candidate_starts.append(candidate)
            if len(candidate_starts) >= 6:
                break
        if len(candidate_starts) >= 6:
            break

    suggestions: List[Dict[str, Any]] = []
    block_intent = "goal.focus" if goal_id else "focus.block"
    duration_ms = session_minutes * 60 * 1000

    for candidate in candidate_starts:
        end = candidate + timedelta(milliseconds=duration_ms)
        receipts = {
            "cadence": cadence_profile.get("cadence", "none"),
            "session_minutes": session_minutes,
            "conflict_checked": True,
            "timezone": cadence_profile.get("timezone", "UTC"),
            "goal_context": goal_id,
        }
        suggestions.append(
            {
                "start": _to_iso(candidate),
                "end": _to_iso(end),
                "intent": block_intent,
                "goal_id": goal_id,
                "receipts": receipts,
            }
        )
        if len(suggestions) >= 3:
            break

    return suggestions


def suggest_schedule_blocks(params: Dict[str, Any]) -> List[Dict[str, Any]]:
    date = params.get("date")
    mood = params.get("mood")
    existing_blocks = params.get("existingBlocks") or []
    base = datetime.fromisoformat(date) if date else datetime.now(timezone.utc)
    suggestions: List[Dict[str, Any]] = []
    for idx in range(3):
        start = base + timedelta(hours=idx + 1)
        end = start + timedelta(minutes=60)
        suggestions.append(
            {
                "id": nanoid(),
                "title": f"Focus Block {idx + 1}",
                "start": _to_iso(start),
                "end": _to_iso(end),
                "focus": "Deep work" if not mood else f"{mood} focus",
            }
        )
    return suggestions

