import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ai_legacy.router import cognition_router


@pytest.mark.asyncio
async def test_persona_selection_and_pipeline():
    input_payload = {"userMessage": "Help me reflect on my goals", "context": {"annotations": [], "entryContent": "Test entry", "entryType": "journal"}}
    result = await cognition_router.route(input_payload)
    assert result["version"] == "cognition.v1"
    assert isinstance(result["response"], str)
    assert "diagnostics" in result


@pytest.mark.asyncio
async def test_gating_fast_path():
    input_payload = {"userMessage": "Hello, how are you?", "context": {"annotations": [], "entryContent": "Test", "entryType": "journal"}}
    result = await cognition_router.route(input_payload)
    assert result["diagnostics"]["gate"]["route"] == "fast_path"
    assert "Hello" in result["response"] or "help" in result["response"]


@pytest.mark.asyncio
async def test_gating_gpt_path():
    input_payload = {"userMessage": "I need to analyze my spending patterns over the last year", "context": {"annotations": [], "entryContent": "Test", "entryType": "journal"}}
    result = await cognition_router.route(input_payload)
    assert result["diagnostics"]["gate"]["route"] == "gpt_thinking"
