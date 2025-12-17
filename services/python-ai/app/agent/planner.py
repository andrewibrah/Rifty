import json
from typing import Any, Dict, Optional

from .cache import EdgeCache
from .types import EnrichedPayload, PlannerResponse

PLANNER_SYSTEM_PROMPT = (
    "Planner chooses tools: journal.create|goal.create|schedule.create|reflect|settings.update|noop.\n"
    "Provided state includes structured goals, schedule windows, and constraints.\n"
    "Output JSON is schema-enforced and idempotent. Never hallucinate IDs."
)


def _build_prompt(payload: EnrichedPayload) -> str:
    intent = payload.intent
    context = "\n---\n".join(payload.contextSnippets)
    probability = f"{intent.confidence:.2f}"
    secondary = f"\nSecondary intent: {intent.secondBest} ({intent.secondConfidence:.2f})" if intent.secondBest and intent.secondConfidence else ""
    goal_section = ""
    if payload.goalContext:
        goal_section = "\n\n[GOALS]\n" + json.dumps(
            [
                {
                    "id": goal.id,
                    "title": goal.title,
                    "status": goal.status,
                    "priority": f"{float(goal.priority_score):.2f}",
                    "current_step": goal.current_step,
                    "next_micro_steps": [step.description for step in goal.micro_steps if not step.completed][:3],
                    "conflicts": goal.conflicts,
                }
                for goal in payload.goalContext
            ],
            indent=2,
        )
    return f'"""\n[INTENT]\n{intent.label} (p={probability}){secondary}\n\n[SLOTS]\n{json.dumps(intent.slots, indent=2)}\n\n[CONTEXT]\n{context or "n/a"}\n\n[USER]\n{payload.userText}\n\n[USER_CONFIG]\n{json.dumps(payload.userConfig or {}, indent=2)}{goal_section}\n"""'


def _parse_tool_arguments(raw: str) -> Optional[PlannerResponse]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    if parsed.get("action") not in {"journal.create", "goal.create", "schedule.create", "reflect", "settings.update", "noop"}:
        return None
    if parsed.get("ask") is not None and not isinstance(parsed.get("ask"), str):
        return None
    if not isinstance(parsed.get("payload"), dict):
        return None
    return PlannerResponse(**parsed)


def _build_cache_key(payload: EnrichedPayload) -> str:
    return json.dumps(
        {
            "label": payload.intent.label,
            "slots": payload.intent.slots,
            "context": payload.contextSnippets,
            "text": payload.userText,
            "userConfig": payload.userConfig,
            "goalContext": [goal.model_dump() for goal in payload.goalContext] if payload.goalContext else None,
        },
        sort_keys=True,
    )


def _planner_ttl(action: Optional[str]) -> int:
    if action == "reflect":
        return 2 * 60 * 1000
    if action == "settings.update":
        return 5 * 60 * 1000
    if action == "noop":
        return 60 * 1000
    return 0


def _heuristic_plan(payload: EnrichedPayload) -> PlannerResponse:
    label = payload.intent.label.lower()
    ask: Optional[str] = None
    action = "noop"
    if "schedule" in label:
        action = "schedule.create"
    elif "goal" in label:
        action = "goal.create"
    elif "journal" in label or "entry" in label:
        action = "journal.create"
    elif "reflect" in label:
        action = "reflect"
    elif "command" in label:
        action = "settings.update"
    return PlannerResponse(action=action, ask=ask, payload={"slots": payload.intent.slots, "context": payload.contextSnippets})


async def plan_action(args: Dict[str, Any]) -> Dict[str, Any]:
    payload: EnrichedPayload = args["payload"]
    cache_key = _build_cache_key(payload)
    cached = await EdgeCache.get(cache_key)
    if cached:
        return {"response": PlannerResponse(**cached) if isinstance(cached, dict) else cached, "raw": {"cached": True}}

    prompt = _build_prompt(payload)
    response = _heuristic_plan(payload)

    ttl = _planner_ttl(response.action)
    if ttl > 0:
        await EdgeCache.set(cache_key, response.model_dump(), ttl)

    return {"response": response, "raw": {"prompt": prompt, "heuristic": True}}


PlannerTools = {
    "type": "function",
    "function": {"name": "plan_router", "description": "Select downstream action and structured payload for Riflett subsystems.", "parameters": {}},
}

