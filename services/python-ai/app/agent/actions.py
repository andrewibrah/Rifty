from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .types import PlannerResponse


class ToolExecutionContext(Dict[str, Any]):
    originalText: str


class ToolExecutionResult(Dict[str, Any]):
    action: str
    payload: Dict[str, Any]


def _get_start_time(payload: Dict[str, Any]) -> Optional[str]:
    if isinstance(payload.get("start"), str):
        return payload["start"]
    if isinstance(payload.get("start_at"), str):
        return payload["start_at"]
    return None


def _get_end_time(payload: Dict[str, Any]) -> Optional[str]:
    if isinstance(payload.get("end"), str):
        return payload["end"]
    if isinstance(payload.get("end_at"), str):
        return payload["end_at"]
    return None


def _persist_schedule_block(block: Dict[str, Any]) -> Dict[str, Any]:
    # In-memory stub replicating persistScheduleBlock shape.
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": block.get("id") or f"sched_{now}",
        "user_id": block.get("user_id") or "stub-user",
        "start_at": block["start"],
        "end_at": block["end"],
        "intent": block.get("intent", "focus.block"),
        "summary": block.get("summary"),
        "goal_id": block.get("goal_id"),
        "location": block.get("location"),
        "attendees": block.get("attendees", []),
        "receipts": block.get("receipts", {}),
        "metadata": block.get("metadata", {}),
        "created_at": now,
        "updated_at": now,
    }


async def handle_tool_call(plan: Optional[PlannerResponse], _context: Optional[ToolExecutionContext] = None) -> Optional[ToolExecutionResult]:
    if not plan:
        return None

    if plan.action == "schedule.create":
        payload = dict(plan.payload or {})
        start_raw = _get_start_time(payload)
        end_raw = _get_end_time(payload)

        if not start_raw or not end_raw:
            raise ValueError("Planner schedule payload missing start/end")

        start_date = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
        end_date = datetime.fromisoformat(end_raw.replace("Z", "+00:00"))

        if start_date >= end_date:
            raise ValueError("Schedule start time must be before end time")

        receipts = payload.get("receipts") if isinstance(payload.get("receipts"), dict) else {}
        metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}

        block_input = {
            "start": start_raw,
            "end": end_raw,
            "intent": payload.get("intent") if isinstance(payload.get("intent"), str) and payload.get("intent").strip() else "focus.block",
            "goal_id": payload.get("goal_id") if isinstance(payload.get("goal_id"), str) else None,
            "summary": payload.get("summary") if isinstance(payload.get("summary"), str) else None,
            "location": payload.get("location") if isinstance(payload.get("location"), str) else None,
            "attendees": [attendee for attendee in payload.get("attendees", []) if isinstance(attendee, str)],
            "receipts": receipts,
            "metadata": metadata,
        }

        persisted = _persist_schedule_block(block_input)
        return ToolExecutionResult(action=plan.action, payload={**payload, "schedule": persisted})

    if plan.action in {"journal.create", "goal.create", "settings.update", "reflect", "noop"}:
        return ToolExecutionResult(action=plan.action, payload=plan.payload or {})

    return None

