import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ai_legacy.gate import gate_request, generate_fast_path_response


@pytest.mark.asyncio
async def test_gate_intent_classification():
    cases = [
        ("Hello, how are you?", "small_talk", True),
        ("Schedule a meeting tomorrow", "scheduling", True),
        ("Tag this as important", "tag", True),
        ("Why do I feel this way?", "reflection", False),
        ("Analyze my spending patterns", "reflection", False),
    ]
    for message, expected_intent, expect_fast in cases:
        result = await gate_request({"userMessage": message})
        assert result["intent"] == expected_intent
        assert (result["route"] == "fast_path") == expect_fast


def test_fast_path_responses():
    gate_result = {"route": "fast_path", "confidence": 0.9, "intent": "small_talk", "reason": "High confidence"}
    response = generate_fast_path_response(gate_result, {"userMessage": "Hi there!"})
    assert "Hello" in response or "help" in response

    gate_result = {"route": "fast_path", "confidence": 0.85, "intent": "scheduling", "reason": "Scheduling intent"}
    response = generate_fast_path_response(gate_result, {"userMessage": "Schedule something"})
    assert "scheduling" in response.lower() or "plan" in response.lower()


@pytest.mark.asyncio
async def test_fast_path_ratio():
    mock_requests = [
        "Hello",
        "How are you?",
        "Schedule a call",
        "Tag this entry",
        "Remind me tomorrow",
        "What is the meaning of life?",
        "Analyze my behavior patterns",
        "I need to plan my career",
    ]
    fast_path = 0
    for message in mock_requests:
        result = await gate_request({"userMessage": message})
        if result["route"] == "fast_path":
            fast_path += 1
    fast_path_pct = (fast_path / len(mock_requests)) * 100
    assert fast_path_pct >= 50
