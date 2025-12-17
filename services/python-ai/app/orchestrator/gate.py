import re
from typing import Any, Dict


def gate_request(params: Dict[str, Any]) -> Dict[str, Any]:
    user_message = (params.get("userMessage") or "").lower()
    if re.search(r"\b(hi|hello|hey|how are you|what's up|good morning|good evening)\b", user_message):
        intent = "small_talk"
    elif re.search(r"\b(schedule|calendar|remind|meeting|appointment|plan|todo|task)\b", user_message):
        intent = "scheduling"
    elif re.search(r"\b(tag|label|categorize|organize|sort)\b", user_message):
        intent = "tag"
    elif re.search(r"\b(analyze|reflect|understand|why|how|deep|insight)\b", user_message):
        intent = "reflection"
    else:
        intent = "conversational"

    confidence = 0.9 if intent in {"small_talk", "scheduling", "tag"} else 0.7
    fast_path = intent in {"small_talk", "scheduling", "tag"}
    route = "fast_path" if fast_path else "gpt_thinking"
    reason = (
        f"High confidence {intent} ({confidence:.2f}) - using fast path"
        if fast_path
        else f"Low confidence or complex intent ({intent}: {confidence:.2f}) - escalating to GPT"
    )
    return {
        "route": route,
        "confidence": confidence,
        "reason": reason,
        "intent": intent,
    }
