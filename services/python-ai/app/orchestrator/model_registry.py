from typing import Any, Dict, List, Optional

from ..agent.utils.nanoid import nanoid

_models: List[Dict[str, Any]] = []
_evaluations: List[Dict[str, Any]] = []


def register_model_version(payload: Dict[str, Any]) -> Dict[str, Any]:
    row = {
        "id": nanoid(),
        "model_name": payload.get("modelName"),
        "version": payload.get("version"),
        "description": payload.get("description"),
        "artifact_path": payload.get("artifactPath"),
        "created_by": payload.get("created_by"),
        "created_at": "",
        "metadata": payload.get("metadata") or None,
    }
    _models.append(row)
    return row


def record_model_evaluation(payload: Dict[str, Any]) -> Dict[str, Any]:
    row = {
        "id": nanoid(),
        "model_id": payload.get("modelId"),
        "accuracy": payload.get("accuracy"),
        "top3_accuracy": payload.get("top3Accuracy"),
        "confusion": payload.get("confusion") or {},
        "report_path": payload.get("reportPath"),
        "created_at": "",
    }
    _evaluations.append(row)
    return row


def fetch_latest_model(model_name: str) -> Optional[Dict[str, Any]]:
    candidates = [row for row in _models if row.get("model_name") == model_name]
    return candidates[-1] if candidates else None


def list_model_evaluations(model_id: str) -> List[Dict[str, Any]]:
    return [row for row in _evaluations if row.get("model_id") == model_id]

