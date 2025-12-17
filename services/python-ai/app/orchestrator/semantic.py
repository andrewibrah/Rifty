from typing import Any, Dict


def understand(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "summary": (params.get("userMessage") or "")[:120],
        "signals": ["stub-understand"],
    }


def reason(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "plan": {"steps": ["Reflect", "Suggest action", "Close loop"]},
        "confidence": 0.76,
    }

