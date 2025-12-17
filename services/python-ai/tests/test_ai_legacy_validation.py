import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ai_legacy.schemas.validator import call_with_retry, validate_against_schema


def test_reflection_schema_validation():
    valid_object = {"intent": "reflection", "emotion": "thoughtful", "one_line_mirror": "You seem contemplative", "next_action": "plan"}
    result = validate_against_schema("reflection", valid_object)
    assert result["valid"]

    invalid_object = {"intent": "invalid", "emotion": "thoughtful", "one_line_mirror": "You seem contemplative", "next_action": "plan"}
    result = validate_against_schema("reflection", invalid_object)
    assert not result["valid"]
    assert result["errors"]


def test_plan_schema_validation():
    valid_object = {"intent": "plan", "goal": "Achieve fitness goals", "steps": ["Step 1", "Step 2"], "timeline": "3 months", "resources_needed": ["Gym membership"]}
    assert validate_against_schema("plan", valid_object)["valid"]

    invalid_object = {"intent": "plan", "goal": "Achieve fitness goals", "steps": ["Step"] * 15, "timeline": "3 months", "resources_needed": ["Gym membership"]}
    assert not validate_against_schema("plan", invalid_object)["valid"]


@pytest.mark.asyncio
async def test_call_with_retry_success():
    attempts = {"count": 0}

    async def mock_call(retry_hint=None):
        attempts["count"] += 1
        if attempts["count"] == 1:
            return {"invalid": "data"}
        return {"intent": "reflection", "emotion": "thoughtful", "one_line_mirror": "Valid response", "next_action": "plan"}

    result = await call_with_retry(mock_call, 2, lambda res: validate_against_schema("reflection", res))
    assert attempts["count"] == 2
    assert result["intent"] == "reflection"


@pytest.mark.asyncio
async def test_call_with_retry_failure():
    async def mock_call(retry_hint=None):
        return {"invalid": "data"}

    with pytest.raises(RuntimeError):
        await call_with_retry(mock_call, 1, lambda res: validate_against_schema("reflection", res))
