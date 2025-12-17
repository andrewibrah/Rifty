from typing import Any, Dict


def resolve_persona(intent: str | None) -> Dict[str, Any]:
    # Lightweight persona resolver stub.
    tone = "neutral"
    name = "Generalist"
    if intent and "goal" in intent:
        tone = "direct"
        name = "Architect"
    return {"name": name, "tone": tone}

