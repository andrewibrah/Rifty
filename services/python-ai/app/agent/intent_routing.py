from typing import Any, Dict, List, Optional

from .intent_definitions import get_intent_definition
from .types import RouteDecision, RoutedIntent
from .utils.strings import to_pascal_case, to_snake_case

ROUTE_AT_THRESHOLD = 0.75
CLARIFY_LOWER_THRESHOLD = 0.45
SECONDARY_INTENT_THRESHOLD = 0.6


def _clamp(value: float) -> float:
    if not isinstance(value, (float, int)):
        return 0.0
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return float(value)


def _normalize_top_k(native_top_k: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    if not isinstance(native_top_k, list):
        return []
    seen = set()
    normalized: List[Dict[str, Any]] = []
    for item in native_top_k:
        label = item.get("label")
        confidence = item.get("confidence")
        if not isinstance(label, str) or not isinstance(confidence, (int, float)):
            continue
        if label in seen:
            continue
        seen.add(label)
        normalized.append({"label": label, "confidence": _clamp(float(confidence))})
    return sorted(normalized, key=lambda entry: entry["confidence"], reverse=True)


def build_routed_intent(native_intent: Dict[str, Any], slots: Optional[Dict[str, str]] = None) -> RoutedIntent:
    top_k = _normalize_top_k(native_intent.get("topK") or native_intent.get("top3"))
    primary = top_k[0] if top_k else {"label": native_intent.get("label", ""), "confidence": _clamp(native_intent.get("confidence", 0))}
    second = next((candidate for candidate in top_k if candidate["label"] != primary["label"]), None)

    fallback_definition = lambda label: {
        "id": "unknown",
        "label": label,
        "subsystem": "entries",
        "allowedInEntryChat": True,
    }

    primary_definition_raw = get_intent_definition(primary["label"])
    primary_definition = primary_definition_raw or fallback_definition(primary["label"])
    second_definition_raw = get_intent_definition(second["label"]) if second else None
    second_definition = second_definition_raw or (fallback_definition(second["label"]) if second else None)

    matched_tokens_lookup = {}
    matched_tokens_input = native_intent.get("matchedTokens")
    if isinstance(matched_tokens_input, list):
        for item in matched_tokens_input:
            label = item.get("label") if isinstance(item, dict) else None
            tokens = item.get("tokens") if isinstance(item, dict) else None
            if isinstance(label, str) and isinstance(tokens, list):
                matched_tokens_lookup[label] = [token for token in tokens if isinstance(token, str)]

    resolved_top_k = top_k or [primary]
    matched_tokens = []
    for candidate in resolved_top_k:
        definition_raw = get_intent_definition(candidate["label"])
        definition = definition_raw or fallback_definition(candidate["label"])
        tokens = matched_tokens_lookup.get(definition["label"]) or matched_tokens_lookup.get(candidate["label"]) or []
        matched_tokens.append(
            {
                "label": to_pascal_case(definition["label"]) if definition_raw else candidate["label"],
                "tokens": tokens,
            }
        )

    runtime_tokens = native_intent.get("tokens") if isinstance(native_intent.get("tokens"), list) else None

    routed = RoutedIntent(
        label=to_pascal_case(primary_definition["label"]) if primary_definition else primary["label"],
        rawLabel=primary_definition["label"],
        confidence=_clamp(primary.get("confidence", 0)),
        secondBest=to_pascal_case(second_definition["label"]) if second_definition and second_definition_raw else (second["label"] if second else None),
        secondConfidence=_clamp(second["confidence"]) if second else None,
        slots=slots or {},
        topK=resolved_top_k,
        matchedTokens=matched_tokens,
        modelVersion=native_intent.get("modelVersion"),
        tokens=runtime_tokens,
    )
    return routed


def route_intent(intent: RoutedIntent) -> RouteDecision:
    if intent.confidence >= ROUTE_AT_THRESHOLD:
        maybe_secondary = intent.secondBest if (intent.secondConfidence or 0) >= SECONDARY_INTENT_THRESHOLD else None
        return RouteDecision(kind="commit", primary=intent.label, maybeSecondary=maybe_secondary)

    if intent.confidence >= CLARIFY_LOWER_THRESHOLD:
        human_label = to_snake_case(intent.label).replace("_", " ")
        return RouteDecision(kind="clarify", question=f"Did you want to {human_label}?")

    return RouteDecision(kind="fallback")


def should_consider_secondary(intent: RoutedIntent) -> bool:
    return (intent.secondConfidence or 0) >= SECONDARY_INTENT_THRESHOLD

