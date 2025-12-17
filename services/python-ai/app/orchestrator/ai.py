import time
from typing import Any, Dict, List, Optional
from .context import resolve_persona
from .gate import gate_request
from .riflett_spine import record_ai_event
from .semantic import reason, understand

MODEL_NAME = "gpt-4o-mini"
SPINE_VERSION = "spine.v1"


def _strip_code_fences(value: str) -> str:
    return value.replace("```json", "").replace("```", "").strip()


def _validate_ai_response(payload: Dict[str, Any]) -> None:
    for key in ("reply", "learned", "ethical"):
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            raise ValueError(f"AI response missing required string field: {key}")


def resolve_openai_api_key(explicit: Optional[str] = None) -> str:
    # Stub resolver: return explicit override or placeholder key.
    return explicit or "test-openai-key"


def build_context(entry_content: str, annotations: List[Dict[str, Any]]) -> str:
    history_lines = []
    for annotation in annotations:
        speaker = "AI/Bot" if annotation.get("kind") == "bot" else "User"
        label = str(annotation.get("channel") or "NOTE").upper()
        created = annotation.get("created_at") or "unknown"
        content = annotation.get("content") or ""
        history_lines.append(f"{speaker} ({label}) @ {created}: {content}")
    history = "\n".join(history_lines)
    return f"Entry Summary: {entry_content}\n\n" + (f"Conversation History:\n{history}" if history else "Conversation History: none yet.")


def generate_ai_response(params: Dict[str, Any]) -> Dict[str, Any]:
    started_at = time.time() * 1000
    context = build_context(params.get("entryContent", ""), params.get("annotations", []))
    gate_result = None
    plan_metadata = {
        "steps": [],
        "confidence": None,
        "route": "gpt_thinking",
        "reason": "",
    }

    try:
        gate_result = gate_request(
            {
                "userMessage": params.get("userMessage", ""),
                "context": {
                    "annotations": params.get("annotations", []),
                    "entryContent": params.get("entryContent", ""),
                    "entryType": params.get("entryType", ""),
                },
            }
        )
        plan_metadata = {
            "steps": ["Fast path heuristics handled this directly."] if gate_result["route"] == "fast_path" else [],
            "confidence": gate_result.get("confidence"),
            "route": gate_result.get("route"),
            "reason": gate_result.get("reason", ""),
        }
    except Exception:
        gate_result = None

    persona_profile = resolve_persona(gate_result["intent"] if gate_result else None)

    if not gate_result or gate_result.get("route") != "fast_path":
        try:
            understand_result = understand(
                {"userMessage": params.get("userMessage", ""), "context": {"annotations": params.get("annotations", []), "entryContent": params.get("entryContent", ""), "entryType": params.get("entryType", "")}}
            )
            reason_result = reason({"understandOutput": understand_result, "context": {"annotations": params.get("annotations", []), "entryContent": params.get("entryContent", ""), "entryType": params.get("entryType", "")}})
            plan_metadata = {
                **plan_metadata,
                "steps": reason_result.get("plan", {}).get("steps", [])[:4],
                "confidence": reason_result.get("confidence"),
            }
        except Exception:
            pass

    lessons = params.get("lessons") or []
    raw_response = {
        "reply": f"{params.get('userMessage', '').strip() or 'Hello'}, noted.",
        "learned": "Reflected on user entry context.",
        "ethical": "Followed safety and empathy guidelines.",
    }
    _validate_ai_response(raw_response)

    latency_ms = int(max(0, round(time.time() * 1000 - started_at)))
    output_json = {
        "version": SPINE_VERSION,
        "data": {
            "reply": raw_response["reply"],
            "learned": raw_response["learned"],
            "ethical": raw_response["ethical"],
        },
        "metadata": {
            "persona": persona_profile["name"],
            "route": gate_result["route"] if gate_result else None,
            "plan_steps": plan_metadata["steps"],
            "lessons": lessons,
        },
    }
    ai_event_id = None
    try:
        inserted = record_ai_event(
            {
                "intent": params.get("intentContext", {}).get("id")
                or params.get("entryType")
                or "unknown",
                "input": str(params.get("userMessage", ""))[:4000],
                "outputJson": output_json,
                "latencyMs": latency_ms,
                "model": MODEL_NAME,
                "temperature": 0.7,
                "metadata": {
                    "entry_type": params.get("entryType"),
                    "intent_id": params.get("intentContext", {}).get("id"),
                    "intent_label": params.get("intentContext", {}).get("label"),
                    "intent_confidence": params.get("intentContext", {}).get("confidence"),
                    "intent_subsystem": params.get("intentContext", {}).get("subsystem"),
                    "annotation_count": len(params.get("annotations", [])),
                    "persona": persona_profile["name"],
                    "persona_tone": persona_profile["tone"],
                    "gate_route": gate_result["route"] if gate_result else None,
                    "gate_intent": gate_result.get("intent") if gate_result else None,
                    "gate_confidence": gate_result.get("confidence") if gate_result else None,
                    "gate_reason": gate_result.get("reason") if gate_result else None,
                    "plan_steps": plan_metadata["steps"],
                    "plan_confidence": plan_metadata["confidence"],
                    "lessons_applied": lessons,
                },
            }
        )
        ai_event_id = inserted["id"] if inserted else None
    except Exception:
        ai_event_id = None

    return {
        **raw_response,
        "aiEventId": ai_event_id,
        "latencyMs": latency_ms,
        "metadata": {
            "persona": persona_profile,
            "gate": gate_result,
            "plan": plan_metadata,
            "lessonsApplied": lessons,
        },
    }


def build_fallback_note(intent: Dict[str, Any], message: str) -> Dict[str, str]:
    label = intent.get("label") or intent.get("id") or "note"
    tag = sanitize_tag(intent.get("id") or label)
    summary = (message or "").strip()[:240]
    return {
        "noteTitle": f"{label} draft",
        "noteBody": summary or label,
        "searchTag": tag or "journal-entry",
        "guidance": "Fallback note generated locally. Ask the user for more specifics in the main chat.",
    }


def sanitize_tag(tag: str) -> str:
    return (
        (tag or "")
        .lower()
        .replace(" ", "-")
        .replace("--", "-")
        .strip("-")[:60]
    )


def compose_entry_note(params: Dict[str, Any]) -> Dict[str, str]:
    # Offline stub that builds a deterministic note mirroring schema.
    intent = params.get("intent", {})
    message = params.get("userMessage", "") or intent.get("id", "")
    enriched = params.get("enriched", {})
    context_snippets = enriched.get("contextSnippets") or []
    summary_part = context_snippets[0] if context_snippets else message
    note = {
        "noteTitle": f"{intent.get('label') or intent.get('id') or 'Note'} draft",
        "noteBody": summary_part[:300] if isinstance(summary_part, str) else str(summary_part),
        "searchTag": sanitize_tag(intent.get("id") or "note"),
        "guidance": "Seed note generated locally.",
    }
    try:
        _validate_entry_note(note)
        return note
    except Exception:
        return build_fallback_note(intent, message)


def _validate_entry_note(payload: Dict[str, Any]) -> None:
    for key in ("noteTitle", "noteBody", "searchTag", "guidance"):
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            raise ValueError(f"Entry note payload missing {key}")
