from dataclasses import asdict, is_dataclass
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..agent.pipeline import handle_utterance

router = APIRouter(prefix="/agent", tags=["agent"])


def _serialize(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(val) for key, val in value.items()}
    return value


@router.post("/utterance")
async def utterance(body: Dict[str, Any]) -> Dict[str, Any]:
    text = body.get("text")
    options = body.get("options")
    if not isinstance(text, str):
        raise HTTPException(status_code=400, detail="text is required")
    result = await handle_utterance(text, options)
    return _serialize(result)

