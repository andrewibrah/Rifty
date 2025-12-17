from typing import Any, Dict, List, Optional

from ..agent.utils.nanoid import nanoid

EDGE_VERSION = "spine.v1"
AUTH_MISSING_ERROR = "auth_session_missing"

_ai_events: List[Dict[str, Any]] = []
_feedback: List[Dict[str, Any]] = []
_failures: List[Dict[str, Any]] = []


def ensure_auth_session() -> str:
    # Stubbed auth returns a token.
    return "stub-token"


def record_ai_event(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ai_event = {
        "id": nanoid(),
        "user_id": "user-stub",
        "intent": params.get("intent"),
        "input": params.get("input"),
        "output_json": params.get("outputJson"),
        "latency_ms": params.get("latencyMs"),
        "model": params.get("model"),
        "temperature": params.get("temperature"),
        "created_at": "",
        "metadata": params.get("metadata", {}),
    }
    _ai_events.append(ai_event)
    return ai_event


def submit_feedback(input_payload: Dict[str, Any]) -> Dict[str, Any]:
    ensure_auth_session()
    feedback = {
        "id": nanoid(),
        "created_at": "",
        "label": input_payload.get("label"),
        "correction": input_payload.get("correction"),
        "tags": input_payload.get("tags"),
        "confidence_from_model": input_payload.get("confidenceFromModel"),
    }
    ai_event = {"id": input_payload.get("aiEventId"), "intent": "unknown", "created_at": ""}
    _feedback.append({"feedback": feedback, "ai_event": ai_event})
    return {"feedback": feedback, "ai_event": ai_event}


def rebuild_context(input_text: str) -> Dict[str, Any]:
    ensure_auth_session()
    return {
        "recent_modes": [],
        "top_topics": [],
        "last_goals": [],
        "likely_need": "context_refresh",
        "evidence_nodes": [],
    }


def track_failure(input_payload: Dict[str, Any]) -> Dict[str, Any]:
    ensure_auth_session()
    failure = {
        "id": nanoid(),
        "created_at": "",
        "failure_type": input_payload.get("failure_type"),
        "ai_event_id": input_payload.get("aiEventId"),
    }
    lesson = {
        "id": nanoid(),
        "lesson_text": input_payload.get("signal") or "",
        "scope": "intent",
        "created_at": "",
    }
    recent_lessons = [lesson]
    _failures.append({"failure": failure, "lesson": lesson})
    return {"failure": failure, "lesson": lesson, "recent_lessons": recent_lessons}


def refresh_feedback_stats() -> None:
    ensure_auth_session()

