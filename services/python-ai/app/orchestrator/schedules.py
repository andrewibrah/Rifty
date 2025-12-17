from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional


def suggest_blocks(uid: Optional[str] = None, goal_id: Optional[str] = None) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    suggestions: List[Dict[str, Any]] = []
    for idx, hour in enumerate([9, 13, 16]):
        start = now + timedelta(hours=hour - now.hour + idx + 1)
        end = start + timedelta(minutes=45)
        suggestions.append(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "intent": "focus.block",
                "goal_id": goal_id,
                "receipts": {"cadence": "none", "session_minutes": 45, "goal_context": goal_id},
            }
        )
    return suggestions

