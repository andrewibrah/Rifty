import pathlib
import sys

from fastapi.testclient import TestClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402
from app.agent.memory import Memory  # noqa: E402


client = TestClient(app)


def test_schedules_suggest_endpoint():
    res = client.post("/schedules/suggest", json={"date": "2025-01-01T00:00:00Z"})
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list) and len(data) >= 1
    assert "start" in data[0]


def test_personalization_bundle_endpoint():
    res = client.post("/personalization/bundle", json={"uid": "user-1"})
    assert res.status_code == 200
    data = res.json()
    assert "profile" in data
    assert "settings" in data


def test_memory_endpoints():
    import asyncio

    asyncio.get_event_loop().run_until_complete(
        Memory.upsert({"id": "entry:1", "kind": "entry", "text": "project kickoff", "ts": 1})
    )
    search_res = client.post("/memory/search", json={"query": "project", "kinds": ["entry"], "topK": 3})
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert isinstance(search_data, list)
    brief_res = client.post(
        "/memory/brief",
        json={"uid": "user-1", "intent": {"label": "Conversational", "rawLabel": "Conversational", "confidence": 0.8, "slots": {}, "topK": []}, "query": "project"},
    )
    assert brief_res.status_code == 200
    brief_data = brief_res.json()
    assert "operatingPicture" in brief_data


def test_persona_tag_endpoint():
    state = {
        "personalization_mode": "full",
        "local_cache_enabled": True,
        "cadence": "daily",
        "goals": ["execution"],
        "learning_style": {"visual": 8, "auditory": 5, "kinesthetic": 8},
        "session_length_minutes": 20,
        "spiritual_prompts": False,
        "bluntness": 8,
        "language_intensity": "direct",
        "logging_format": "structured",
        "drift_rule": {"enabled": True, "after": "2025-01-01"},
        "crisis_card": "note",
        "persona_tag": "Architect",
        "checkin_notifications": False,
        "missed_day_notifications": False,
        "updated_at": None,
        "created_at": None,
        "extra_goal": None,
    }
    res = client.post("/persona/tag", json={"state": state})
    assert res.status_code == 200
    assert "persona_tag" in res.json()


def test_intent_definition_endpoint():
    res = client.post("/intent/definition", json={"label": "Conversational"})
    assert res.status_code == 200
    data = res.json()
    assert "definition" in data
    assert data["entryType"] == "journal"
