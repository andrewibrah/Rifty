from typing import Any, Dict, List, Optional

from ..agent.memory import Memory
from ..agent.types import RoutedIntent
from ..schemas.goal import GoalContextItem
from .goals import list_active_goals_with_context
from .schedules import suggest_blocks

MODEL_NAME = "gpt-4o-mini"


def _safe_slice(value: Optional[str], length: int) -> str:
    if not value:
        return ""
    return value if len(value) <= length else f"{value[: length - 1]}…"


async def build_brief(uid: Optional[str], intent: Dict[str, Any], cached_operating_picture: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    user_id = uid or "stub-user"
    query = intent.get("text") or intent.get("enriched", {}).get("userText") or ""
    routed = intent.get("routedIntent")
    if isinstance(routed, RoutedIntent):
        routed_intent = routed
    else:
        routed_intent = RoutedIntent(
            label=intent.get("label") or "Conversational",
            rawLabel=intent.get("label") or "Conversational",
            confidence=float(intent.get("confidence") or 0.8),
            secondBest=None,
            secondConfidence=None,
            slots=intent.get("slots") or {},
            topK=intent.get("top3") or [],
        )

    fallback_operating = cached_operating_picture or {
        "why_model": None,
        "top_goals": [],
        "hot_entries": [],
        "next_72h": [],
        "cadence_profile": {
            "cadence": "none",
            "session_length_minutes": 25,
            "last_message_at": None,
            "missed_day_count": 0,
            "current_streak": 0,
            "timezone": "UTC",
        },
        "risk_flags": [],
    }

    brief_result = {"operatingPicture": fallback_operating, "rag": [], "memoryRecords": []}
    try:
        brief_result = await Memory.get_brief(user_id, routed_intent, query, {"limit": 5, "cachedOperatingPicture": cached_operating_picture})
    except Exception:
        brief_result = {"operatingPicture": fallback_operating, "rag": [], "memoryRecords": []}

    goal_context: List[GoalContextItem] = intent.get("enriched", {}).get("goalContext") or []
    if not goal_context:
        try:
            goal_context = await list_active_goals_with_context(user_id, 5)
        except Exception:
            goal_context = []

    schedule_suggestions: List[Dict[str, Any]] = []
    try:
        raw_suggestions = await suggest_blocks(user_id, goal_context[0].id if goal_context else None)
        schedule_suggestions = [
            {
                "start": suggestion["start"],
                "end": suggestion["end"],
                "intent": suggestion["intent"],
                "goal_id": suggestion.get("goal_id"),
                "receipts": suggestion.get("receipts", {}),
            }
            for suggestion in raw_suggestions
        ]
    except Exception:
        schedule_suggestions = []

    return {
        "operatingPicture": brief_result.get("operatingPicture", fallback_operating),
        "goalContext": goal_context,
        "retrieval": brief_result.get("rag", []),
        "scheduleSuggestions": schedule_suggestions,
    }


def synthesize(plan_policy: Optional[Dict[str, Any]], brief: Dict[str, Any]) -> Dict[str, Any]:
    goal_context: List[GoalContextItem] = brief.get("goalContext", [])
    operating_picture = brief.get("operatingPicture", {})
    risk_flag = (operating_picture.get("risk_flags") or [None])[0]
    hot_entries = operating_picture.get("hot_entries") or []
    hot_entry = hot_entries[0] if hot_entries else None

    diagnosis_parts: List[str] = []
    if risk_flag:
        diagnosis_parts.append(f"Risk: {risk_flag}")
    if goal_context:
        diagnosis_parts.append(f"Focus on {_safe_slice(goal_context[0].title, 48)}")
    if not diagnosis_parts and hot_entry:
        diagnosis_parts.append(f"Mind the recent entry on {hot_entry.get('created_at', '')[:10]}")
    if not diagnosis_parts:
        diagnosis_parts.append("Steady state; reinforce primary aim")
    diagnosis = " · ".join(diagnosis_parts)

    levers: List[Dict[str, Any]] = []
    if goal_context:
        top_goal = goal_context[0]
        first_pending = next((step for step in top_goal.micro_steps if not step.completed), None)
        receipt = f"goal:{top_goal.id}" if top_goal.id else None
        evidence = _safe_slice(first_pending.description if first_pending else top_goal.status, 80)
        levers.append({"label": top_goal.title, "evidence": evidence, "receipt": receipt})
    if hot_entry:
        receipt = f"entry:{hot_entry.get('id')}" if hot_entry.get("id") else None
        evidence = _safe_slice(hot_entry.get("summary") or hot_entry.get("snippet"), 90)
        levers.append({"label": f"Reflect on {hot_entry.get('created_at', '')[:10]}", "evidence": evidence, "receipt": receipt})
    if brief.get("scheduleSuggestions"):
        suggestion = brief["scheduleSuggestions"][0]
        receipt = f"goal:{suggestion.get('goal_id')}" if suggestion.get("goal_id") else None
        levers.append({"label": "Protect focus time", "evidence": f"Block {suggestion.get('start')} → {suggestion.get('end')}", "receipt": receipt})
    cadence_profile = operating_picture.get("cadence_profile") or {}
    levers.append({"label": "Cadence tune", "evidence": f"Cadence set to {cadence_profile.get('cadence', 'none')}; streak {cadence_profile.get('current_streak', 0)}", "receipt": f"profile:{cadence_profile.get('timezone', 'UTC')}"})

    bounded_levers = levers[:3]

    if plan_policy and plan_policy.get("action") == "schedule.create":
        start = plan_policy.get("payload", {}).get("start") or plan_policy.get("payload", {}).get("start_at")
        end = plan_policy.get("payload", {}).get("end") or plan_policy.get("payload", {}).get("end_at")
        goal_id = plan_policy.get("payload", {}).get("goal_id")
        start_label = start or "scheduled block"
        end_label = end or ""
        detail = f"{start_label} – {end_label}".strip(" –")
        action = {"title": "Book focus block", "detail": detail, "receipts": {"start_at": start or "", "end_at": end or "", **({"goal_id": goal_id} if goal_id else {})}}
    elif plan_policy and plan_policy.get("action") == "goal.create" and goal_context:
        micro_steps = goal_context[0].micro_steps
        micro = next((step for step in micro_steps if not step.completed), None)
        action = {"title": "Draft micro-step", "detail": _safe_slice(micro.description if micro else (goal_context[0].current_step or "Define first step"), 120), "receipts": {"goal_id": goal_context[0].id}}
    elif brief.get("scheduleSuggestions"):
        suggestion = brief["scheduleSuggestions"][0]
        action = {"title": "Try 30m block", "detail": f"{suggestion.get('start')} → {suggestion.get('end')}", "receipts": {"start_at": suggestion.get("start"), "end_at": suggestion.get("end"), **({"goal_id": suggestion.get("goal_id")} if suggestion.get("goal_id") else {})}}
    elif goal_context:
        micro = next((step for step in goal_context[0].micro_steps if not step.completed), None)
        action = {"title": "Advance goal", "detail": _safe_slice(micro.description if micro else "Clarify next step", 120), "receipts": {"goal_id": goal_context[0].id}}
    else:
        action = {"title": "Log reflection", "detail": "Capture one concrete win", "receipts": {}}

    retrieval_confidence = min(1, 0.5 + len(brief.get("retrieval", [])) * 0.1)
    plan_confidence = 0.7 if plan_policy else 0.45
    overall_confidence = (retrieval_confidence + plan_confidence) / 2

    return {
        "diagnosis": diagnosis,
        "levers": bounded_levers,
        "action": action,
        "confidence": {
            "retrieval": round(retrieval_confidence, 2),
            "plan": round(plan_confidence, 2),
            "overall": round(overall_confidence, 2),
        },
    }


def build_receipts_footer(synthesis: Dict[str, Any]) -> List[str]:
    receipts = set()
    for lever in synthesis.get("levers", []):
        if lever.get("receipt"):
            receipts.add(f"{lever['receipt']} · {lever['label']}")
    for key, value in (synthesis.get("action", {}).get("receipts") or {}).items():
        if value:
            receipts.add(f"{key}:{value}")
    return list(receipts)


async def generate_main_chat_reply(args: Dict[str, Any]) -> Dict[str, Any]:
    planner = args.get("planner")
    brief = args.get("brief") or await build_brief(None, args.get("intent", {}), args.get("cachedOperatingPicture"))
    synthesis = args.get("synthesis") or synthesize(planner, brief)
    reply_text = f"{synthesis['diagnosis']}. Action: {synthesis['action']['title']}."
    learned = "Synthesized insights from brief."
    ethical = "Applied safety and brevity guidelines."
    payload = {
        "reply": reply_text,
        "learned": learned,
        "ethical": ethical,
        "receiptsFooter": build_receipts_footer(synthesis),
        "confidence": synthesis["confidence"],
        "synthesis": synthesis,
    }
    return payload
