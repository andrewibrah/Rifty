import math
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..schemas.personalization import PersonalizationRuntime
from .goal_context import list_active_goals_with_context
from .intent_definitions import get_intent_definition
from .intent_routing import build_routed_intent, route_intent
from .memory import Memory, MemoryRecord
from .redactor import Redactor
from .riflett_intent_classifier import classify_riflett_intent, to_native_label
from .slot_filler import SlotFillOptions, fill
from .telemetry import Telemetry
from .types import EnrichedPayload, RoutedIntent
from .user_config import UserConfig

HandleUtteranceOptions = Dict[str, Any]

GOAL_KEYWORDS = ["goal", "goals", "milestone", "milestones", "project", "habit", "plan"]
CONFIG_REFRESH_WINDOW_MS = 5 * 60 * 1000


def _needs_refresh(config: PersonalizationRuntime) -> bool:
    if not config.user_settings and not config.persona:
        return True
    try:
        resolved_at_dt = datetime.fromisoformat(config.resolved_at.replace("Z", "+00:00"))
        resolved_at_ms = resolved_at_dt.timestamp() * 1000
    except Exception:
        return True
    return (time.time() * 1000 - resolved_at_ms) > CONFIG_REFRESH_WINDOW_MS


def _to_payload_config(config: PersonalizationRuntime) -> Dict[str, Any]:
    payload = config.model_dump()
    payload["user_settings"] = payload.get("user_settings") or None
    payload["privacy_gates"] = dict(payload.get("privacy_gates") or {})
    payload["crisis_rules"] = dict(payload.get("crisis_rules") or {})
    return payload


def _should_load_goal_context(text: str, routed_intent: RoutedIntent, classification: Dict[str, Any]) -> bool:
    normalized = text.lower()
    if any(keyword in normalized for keyword in GOAL_KEYWORDS):
        return True
    if "goal" in routed_intent.label.lower():
        return True
    duplicate_kind = (classification.get("duplicateMatch") or {}).get("kind", "")
    if isinstance(duplicate_kind, str) and "goal" in duplicate_kind.lower():
        return True
    target_type = classification.get("targetEntryType") or ""
    if isinstance(target_type, str) and target_type.lower() == "goal":
        return True
    return False


def _clamp01(value: float) -> float:
    if not isinstance(value, (float, int)):
        return 0.0
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return float(value)


def _logistic(value: float) -> float:
    return 1 / (1 + math.exp(-value))


priority_weight_by_kind: Dict[str, float] = {
    "goal": 1,
    "schedule": 0.75,
    "entry": 0.55,
    "event": 0.45,
    "pref": 0.35,
}

relationship_weight_by_kind: Dict[str, float] = {
    "goal": 0.85,
    "schedule": 0.7,
    "entry": 0.5,
    "event": 0.4,
    "pref": 0.35,
}


@dataclass
class ScoredMemoryRecord(MemoryRecord):
    compositeScore: float
    scoring: Dict[str, float]


def score_context_records(records: List[MemoryRecord], options: Optional[Dict[str, Any]] = None) -> List[ScoredMemoryRecord]:
    if not records:
        return []
    timestamps = [record.ts for record in records]
    mean_ts = sum(timestamps) / len(timestamps)
    variance = sum((ts - mean_ts) ** 2 for ts in timestamps) / len(timestamps)
    std_ts = math.sqrt(variance) or 1
    scored = []
    for record in records:
        recency_z = (record.ts - mean_ts) / std_ts
        recency_score = _logistic(recency_z)
        priority = priority_weight_by_kind.get(record.kind, 0.4)
        semantic = _clamp01((record.score + 1) / 2)
        affect = 0.5
        relationship = relationship_weight_by_kind.get(record.kind, 0.4)
        time_of_day_score = 0.5
        if options and options.get("userTimeZone"):
            try:
                record_hour = time.gmtime(record.ts / 1000).tm_hour
                now_hour = time.gmtime().tm_hour
                hour_diff = min(abs(record_hour - now_hour), 24 - abs(record_hour - now_hour))
                time_of_day_score = max(0, 1 - hour_diff / 12)
            except Exception:
                time_of_day_score = 0.5
        suggestion_type = options.get("coachingSuggestion", {}).get("type") if options else None
        coaching_score = 0.5
        if suggestion_type == "goal_check":
            coaching_score = 1 if record.kind == "goal" else 0.35
        elif suggestion_type == "reflection":
            coaching_score = 1 if record.kind == "entry" else 0.35
        elif suggestion_type:
            coaching_score = 0.6

        normalized_time = _clamp01(time_of_day_score)
        normalized_coaching = _clamp01(coaching_score)
        composite = (
            0.3 * recency_score
            + 0.25 * priority
            + 0.15 * semantic
            + 0.1 * affect
            + 0.1 * relationship
            + 0.05 * normalized_time
            + 0.05 * normalized_coaching
        )

        scored.append(
            ScoredMemoryRecord(
                id=record.id,
                kind=record.kind,
                text=record.text,
                ts=record.ts,
                embedding=record.embedding,
                score=record.score,
                compositeScore=composite,
                scoring={
                    "recency": round(recency_score, 3),
                    "priority": round(priority, 3),
                    "semantic": round(semantic, 3),
                    "affect": round(affect, 3),
                    "relationship": round(relationship, 3),
                    "timeOfDay": round(normalized_time, 3),
                    "coaching": round(normalized_coaching, 3),
                },
            )
        )
    return sorted(scored, key=lambda rec: rec.compositeScore, reverse=True)


def _summarize_redactions(mapping: Dict[str, str]) -> Dict[str, int]:
    return {placeholder: len(value) if isinstance(value, str) else 0 for placeholder, value in mapping.items()}


async def _ensure_user_config(override: Optional[Dict[str, Any]]) -> PersonalizationRuntime:
    if override:
        await UserConfig.update(override)
        return await UserConfig.snapshot()
    snapshot = await UserConfig.snapshot()
    if _needs_refresh(snapshot):
        return await UserConfig.load_user_config()
    return snapshot


async def handle_utterance(text: str, options_input: Optional[HandleUtteranceOptions] = None) -> Dict[str, Any]:
    options = options_input or {}
    started_at = int(time.time() * 1000)
    trimmed = text.strip()
    if not trimmed:
        raise ValueError("Utterance text is empty")

    search_kinds = options.get("kindsOverride") or ["entry", "goal", "event", "pref"]
    context_records = await Memory.search_top_n({"query": trimmed, "kinds": search_kinds, "topK": options.get("topK", 5)})

    context_options = None
    if options.get("userTimeZone") or options.get("coachingSuggestion"):
        context_options = {}
        if options.get("userTimeZone"):
            context_options["userTimeZone"] = options["userTimeZone"]
        if options.get("coachingSuggestion"):
            context_options["coachingSuggestion"] = options["coachingSuggestion"]

    scored_context_records = score_context_records(context_records, context_options)
    telemetry_retrieval = []
    for record in scored_context_records:
        telemetry_retrieval.append(
            {
                "id": record.id,
                "kind": record.kind,
                "compositeScore": round(record.compositeScore, 3),
                "scoring": record.scoring,
            }
        )

    classification = classify_riflett_intent(trimmed, scored_context_records)  # type: ignore[arg-type]

    native_intent = {
        "label": to_native_label(classification["label"]),
        "confidence": classification["confidence"],
        "top3": [
            {"label": to_native_label(candidate["label"]), "confidence": candidate["confidence"]}
            for candidate in classification["topCandidates"][:3]
        ],
        "topK": [
            {"label": to_native_label(candidate["label"]), "confidence": candidate["confidence"]}
            for candidate in classification["topCandidates"]
        ],
        "modelVersion": "riflett-heuristic-2025-11-07",
        "matchedTokens": [],
        "tokens": [],
    }

    base_routed = build_routed_intent(native_intent)
    slot_options: SlotFillOptions = {}
    if options.get("userTimeZone"):
        slot_options["userTimeZone"] = options["userTimeZone"]
    with_slots = fill(trimmed, base_routed, slot_options)

    redaction = Redactor.mask(trimmed)
    runtime_user_config = await _ensure_user_config(options.get("userConfig"))
    user_config = _to_payload_config(runtime_user_config)

    goal_context = None
    try:
        if _should_load_goal_context(trimmed, with_slots, classification):
            goal_context = await list_active_goals_with_context()
    except Exception:
        goal_context = None

    payload = EnrichedPayload(
        userText=redaction.masked,
        intent=with_slots,
        contextSnippets=[record.text for record in scored_context_records],
        userConfig=user_config,
        classification={
            "id": classification["label"],
            "label": to_native_label(classification["label"]),
            "confidence": classification["confidence"],
            "reasons": classification["reasons"],
            "targetEntryId": classification.get("targetEntryId"),
            "targetEntryType": classification.get("targetEntryType"),
            "duplicateMatch": classification.get("duplicateMatch"),
            "topCandidates": [
                {"label": to_native_label(candidate["label"]), "confidence": candidate["confidence"]}
                for candidate in classification["topCandidates"]
            ],
        },
        goalContext=goal_context,
    )

    decision = route_intent(with_slots)
    trace_id = None
    try:
        trace_id = await Telemetry.record(
            {
                "maskedUserText": redaction.masked,
                "intentLabel": with_slots.label,
                "intentConfidence": with_slots.confidence,
                "decision": decision.model_dump(),
                "retrieval": telemetry_retrieval,
                "redactionSummary": _summarize_redactions(redaction.replacementMap),
                "startedAt": started_at,
            }
        )
    except Exception:
        trace_id = None

    return {
        "decision": decision,
        "routedIntent": with_slots,
        "nativeIntent": native_intent,
        "payload": payload,
        "redaction": redaction,
        "contextRecords": scored_context_records,
        "traceId": trace_id,
    }


def summarize_intent(intent: RoutedIntent) -> str:
    definition = get_intent_definition(intent.label)
    secondary = (
        f" \u2192 {intent.secondBest} ({round(intent.secondConfidence * 100)}%)"
        if intent.secondBest and intent.secondConfidence
        else ""
    )
    return f'{definition["label"]} ({round(intent.confidence * 100)}%){secondary}'
