import pathlib
import sys

from fastapi.testclient import TestClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402


client = TestClient(app)


def test_ai_respond_main_chat():
    payload = {
        "userText": "Need help planning my day",
        "intent": {
            "text": "Need help planning my day",
            "label": "Conversational",
            "confidence": 0.8,
            "slots": {},
            "top3": [],
            "routedIntent": {
                "label": "Conversational",
                "rawLabel": "Conversational",
                "confidence": 0.8,
                "slots": {},
                "topK": [],
            },
        },
    }
    res = client.post("/ai/respond", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data and "ethical" in data


def test_ai_respond_entry_mode():
    payload = {
        "mode": "entry",
        "entryContent": "Today I ran 5 miles.",
        "annotations": [],
        "userMessage": "summarize this",
        "entryType": "journal",
    }
    res = client.post("/ai/respond", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["reply"]
    assert data["metadata"]["plan"]["steps"] == [] or isinstance(data["metadata"]["plan"]["steps"], list)


def test_embed_endpoint():
    res = client.post("/ai/embed", json={"text": "hello world"})
    assert res.status_code == 200
    data = res.json()
    assert "embedding" in data and isinstance(data["embedding"], list)


def test_summarize_endpoint():
    res = client.post("/ai/summarize", json={"content": "Today I completed a goal", "entryType": "journal"})
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data


def test_goals_endpoint_create_and_list():
    create_res = client.post("/ai/goals", json={"operation": "create", "params": {"title": "Test Goal", "micro_steps": []}})
    assert create_res.status_code == 200
    goal = create_res.json()
    list_res = client.post("/ai/goals", json={"operation": "list"})
    assert list_res.status_code == 200
    goals = list_res.json()
    assert any(item["id"] == goal["id"] for item in goals)


def test_context_heuristics_endpoint():
    res = client.post("/ai/context-heuristics", json={"inputText": "I feel tired", "dominantMood": "tired", "topTopic": "work"})
    assert res.status_code == 200
    data = res.json()
    assert data["likely_need"]
    assert isinstance(data["evidence"], list)


def test_model_registry_endpoint():
    register = client.post("/ai/model-registry", json={"operation": "register", "payload": {"modelName": "test", "version": "1.0"}})
    assert register.status_code == 200
    registered = register.json()
    fetched = client.post("/ai/model-registry", json={"operation": "fetch_latest", "modelName": "test"})
    assert fetched.status_code == 200
    assert fetched.json()["id"] == registered["id"]

