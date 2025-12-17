import re
from typing import Any, Dict, Literal

from .pipeline import complexity_score

IntentType = Literal["small_talk", "scheduling", "tag", "reflection", "analysis", "planning", "unknown"]


def _classify_intent_heuristic(user_message: str) -> Dict[str, Any]:
    lower = user_message.lower()
    if re.search(r"\b(hi|hello|hey|how are you|what's up|good morning|good evening)\b", lower):
        return {"intent": "small_talk", "confidence": 0.9}
    if re.search(r"\b(schedule|calendar|remind|meeting|appointment|plan|todo|task)\b", lower):
        return {"intent": "scheduling", "confidence": 0.85}
    if re.search(r"\b(tag|label|categorize|organize|sort)\b", lower):
        return {"intent": "tag", "confidence": 0.85}
    if re.search(r"\b(analyze|reflect|understand|why|how|deep|insight)\b", lower):
        return {"intent": "reflection", "confidence": 0.7}
    return {"intent": "unknown", "confidence": 0.3}


async def gate_request(input_payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        classified = _classify_intent_heuristic(input_payload.get("userMessage", ""))
        intent = classified["intent"]
        confidence = classified["confidence"]
        fast_path_intents = {"small_talk", "scheduling", "tag"}
        should_fast_path = confidence > 0.8 and intent in fast_path_intents
        route = "fast_path" if should_fast_path else "gpt_thinking"
        reason = (
            f"High confidence {intent} ({confidence:.2f}) - using fast path"
            if should_fast_path
            else f"Low confidence or complex intent ({intent}: {confidence:.2f}) - escalating to GPT"
        )
        return {"route": route, "confidence": confidence, "intent": intent, "reason": reason}
    except Exception:
        complexity = complexity_score({"userMessage": input_payload.get("userMessage", "")})
        route = "fast_path" if complexity < 0.5 else "gpt_thinking"
        reason = f"Fallback: complexity {complexity:.2f} -> {route}"
        return {"route": route, "confidence": 0.5, "intent": "unknown", "reason": reason}


def generate_fast_path_response(gate_result: Dict[str, Any], input_payload: Dict[str, Any]) -> str:
    lower = (input_payload.get("userMessage") or "").lower()
    intent = gate_result.get("intent")
    if intent == "small_talk":
        if "how are you" in lower:
            return "I'm doing well, thank you! How can I help you today?"
        return "Hello! Nice to hear from you. What would you like to work on?"
    if intent == "scheduling":
        return "I'd be happy to help you with scheduling. What would you like to plan?"
    if intent == "tag":
        return "Let's organize that. What tags would you like to use?"
    return "I understand you have something to discuss. How can I assist?"
