from typing import Any, Dict


def summarize_entry(content: str, entry_type: str, options: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return {
        "summary": f"Summary of {entry_type}: {content[:120]}",
        "emotion": None,
        "topics": [],
        "people": [],
        "urgency_level": None,
        "suggested_action": None,
        "blockers": None,
        "dates_mentioned": [],
        "reflection": "Stub reflection.",
    }


def detect_goal(content: str) -> Dict[str, Any]:
    goal_detected = "goal" in content.lower()
    return {"goal_detected": goal_detected, "suggested_title": content[:40] if goal_detected else None}

