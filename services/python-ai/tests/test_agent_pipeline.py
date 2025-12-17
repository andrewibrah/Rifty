import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.agent.intent_routing import build_routed_intent, route_intent
from app.agent.memory import Memory, seed_operating_picture, seed_rag_results, set_authenticated_user
from app.agent.pipeline import handle_utterance
from app.agent.telemetry import Telemetry, _trace_store
from app.agent.types import RoutedIntent


@pytest.mark.asyncio
async def test_intent_routing_commit():
    native_intent = {
        "label": "Entry Create",
        "confidence": 0.91,
        "topK": [
            {"label": "Entry Create", "confidence": 0.91},
            {"label": "Conversational", "confidence": 0.4},
        ],
    }
    routed = build_routed_intent(native_intent, {"title": "Sample"})
    decision = route_intent(routed)
    assert decision.kind == "commit"
    assert decision.primary == routed.label


@pytest.mark.asyncio
async def test_pipeline_handle_utterance_basic():
    result = await handle_utterance("remember to call mom tomorrow", {"userTimeZone": "UTC"})
    assert result["decision"].kind in {"commit", "clarify", "fallback"}
    assert result["payload"].userText
    assert isinstance(result["routedIntent"].slots, dict)


@pytest.mark.asyncio
async def test_memory_get_brief_with_stubbed_rag():
    set_authenticated_user("user-1")
    seed_operating_picture(None)
    seed_rag_results(
        [
            {"id": "1", "kind": "entry", "score": 0.9, "snippet": "Project kickoff complete"},
            {"id": "2", "kind": "goal", "score": 0.85, "snippet": "Finish migration plan"},
        ]
    )
    routed = RoutedIntent(
        label="EntryCreate",
        rawLabel="Entry Create",
        confidence=0.9,
        secondBest=None,
        secondConfidence=None,
        slots={},
        topK=[],
    )
    brief = await Memory.get_brief("user-1", routed, "project updates", {"limit": 2})
    assert brief["operatingPicture"] is not None
    assert len(brief["rag"]) == 2
    assert len(brief["memoryRecords"]) == 2


@pytest.mark.asyncio
async def test_telemetry_record_and_update():
    trace_id = await Telemetry.record(
        {
            "maskedUserText": "hi there",
            "intentLabel": "Conversational",
            "intentConfidence": 0.8,
            "decision": {"kind": "commit", "primary": "Conversational"},
            "retrieval": [],
            "redactionSummary": {},
            "startedAt": 0,
        }
    )
    assert trace_id
    await Telemetry.update(trace_id, {"planner": {"action": "noop"}})
    updated = next(trace for trace in _trace_store if trace["id"] == trace_id)
    assert updated["planner"] == {"action": "noop"}
