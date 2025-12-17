from typing import Any, Callable, Dict, List, Literal, Optional

import jsonschema
import json
from pathlib import Path

SchemaType = Literal["reflection", "plan", "schedule"]


def _load_schema(name: str) -> Dict[str, Any]:
    schema_path = Path(__file__).with_name(f"{name}.schema.json")
    with schema_path.open("r", encoding="utf-8") as f:
        return json.load(f)["schema"]


_compiled_schemas = {
    "reflection": jsonschema.Draft7Validator(_load_schema("reflection")),
    "plan": jsonschema.Draft7Validator(_load_schema("plan")),
    "schedule": jsonschema.Draft7Validator(_load_schema("schedule")),
}


def validate_against_schema(schema_type: SchemaType, data: Any) -> Dict[str, Any]:
    validator = _compiled_schemas[schema_type]
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if not errors:
        return {"valid": True}
    return {"valid": False, "errors": [f"{'/'.join(map(str, err.path))} {err.message}" for err in errors]}


async def call_with_retry(call_fn: Callable[[Optional[str]], Any], max_retries: int = 2, validator: Optional[Callable[[Any], Dict[str, Any]]] = None) -> Any:
    last_error: Optional[str] = None
    for attempt in range(max_retries + 1):
        try:
            result = await call_fn(last_error)
            if validator:
                validation = validator(result)
                if not validation.get("valid"):
                    last_error = f"Validation failed: {', '.join(validation.get('errors', []))}"
                    if attempt < max_retries:
                        continue
                    raise ValueError(last_error)
            return result
        except Exception as error:  # pylint: disable=broad-except
            last_error = str(error)
            if attempt >= max_retries:
                raise RuntimeError(f"Failed after {max_retries + 1} attempts. Last error: {last_error}") from error
    raise RuntimeError("Unexpected error in retry logic")

