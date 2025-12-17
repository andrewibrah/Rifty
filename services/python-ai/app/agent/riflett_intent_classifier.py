import re
from typing import Dict, List, Optional

from .context_window import recent as recent_messages, snapshot as window_snapshot
from .memory import MemoryRecord
from .utils.strings import to_title_case


RiflettIntentLabel = [
    "conversational",
    "entry_create",
    "entry_discuss",
    "entry_append",
    "command",
    "search_query",
]


ClassificationCandidate = Dict[str, float]

COMMAND_PATTERN = re.compile(r"^\s*/")
SEARCH_PHRASES = [
    "find",
    "show me",
    "search for",
    "when did i",
    "where did i",
    "what did i write",
    "look up",
    "list",
]
ADDITIVE_PHRASES = [
    "also",
    "update",
    "another",
    "forgot",
    "in addition",
    "plus",
    "adding",
    "one more thing",
]
SAVE_PHRASES = [
    "save",
    "log",
    "capture",
    "remember",
    "write this down",
    "note that",
    "journal",
    "record",
]
TEMPORAL_MARKERS = [
    "today",
    "tonight",
    "this morning",
    "this afternoon",
    "this evening",
    "yesterday",
    "earlier",
    "just now",
    "right now",
    "tomorrow",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]
ACTION_VERBS = [
    "finished",
    "completed",
    "did",
    "ran",
    "talked",
    "spoke",
    "met",
    "decided",
    "started",
    "launched",
    "sent",
    "emailed",
    "called",
    "worked",
    "wrote",
    "built",
    "shipped",
]
PRONOUN_ANCHORS = re.compile(r"\b(it|this|that|the goal|the entry|that goal|this entry|that plan|the plan|that project|this project)\b", re.I)
QUESTION_MARK = re.compile(r"\?")
TIME_REGEX = re.compile(r"\b(\d{1,2}(:\d{2})?\s?(am|pm))\b", re.I)

DUPLICATE_THRESHOLD = 0.85
DUPLICATE_MIN_PREFIX_LENGTH = 20


def _contains_phrase(text: str, phrases: List[str]) -> bool:
    return any(phrase in text for phrase in phrases)


def _has_temporal_marker(text: str) -> bool:
    return _contains_phrase(text, TEMPORAL_MARKERS) or bool(TIME_REGEX.search(text))


def _has_save_language(text: str) -> bool:
    return _contains_phrase(text, SAVE_PHRASES)


def _has_additive_language(text: str) -> bool:
    return _contains_phrase(text, ADDITIVE_PHRASES)


def _has_action_language(text: str) -> bool:
    return any(verb in text for verb in ACTION_VERBS)


def _is_search_query(text: str) -> bool:
    return _contains_phrase(text, SEARCH_PHRASES)


def _base_candidate(label: str, confidence: float) -> Dict[str, float]:
    return {"label": label, "confidence": confidence}


def _pick_duplicate(records: List[MemoryRecord]) -> Optional[MemoryRecord]:
    return next((record for record in records if record.score >= DUPLICATE_THRESHOLD), None)


def _map_kind_to_entry_type(kind: Optional[str]) -> Optional[str]:
    if not kind:
        return None
    normalized = kind.lower()
    if "goal" in normalized:
        return "goal"
    if "event" in normalized or "schedule" in normalized:
        return "schedule"
    if "entry" in normalized or "journal" in normalized:
        return "journal"
    return None


def classify_riflett_intent(text: str, context_records: List[MemoryRecord]):
    trimmed = text.strip()
    lower = trimmed.lower()
    reasons: List[str] = []
    context_snapshot = window_snapshot()
    recent = recent_messages()

    if not trimmed:
        return {
            "label": "conversational",
            "confidence": 0.6,
            "reasons": ["Empty message defaults to conversational"],
            "topCandidates": [_base_candidate("conversational", 0.6)],
        }

    if COMMAND_PATTERN.search(trimmed):
        reasons.append("Slash-prefixed command detected")
        return {
            "label": "command",
            "confidence": 0.99,
            "reasons": reasons,
            "topCandidates": [_base_candidate("command", 0.99)],
        }

    if _is_search_query(lower):
        reasons.append("Search verb detected")
        confidence = 0.94 if len(lower) > 24 else 0.9
        return {
            "label": "search_query",
            "confidence": confidence,
            "reasons": reasons,
            "topCandidates": [
                _base_candidate("search_query", confidence),
                _base_candidate("conversational", 0.7),
            ],
        }

    duplicate = _pick_duplicate(context_records)
    duplicate_meta = (
        {"id": duplicate.id, "score": duplicate.score, "text": duplicate.text, "kind": duplicate.kind}
        if duplicate
        else None
    )

    has_additive = _has_additive_language(lower)
    in_window = bool(context_snapshot and context_snapshot.get("isActive"))
    has_pronoun_anchor = bool(PRONOUN_ANCHORS.search(trimmed))

    if duplicate_meta and has_additive:
        reasons.append("High-similarity memory match with additive language")
        entry_type = _map_kind_to_entry_type(duplicate_meta["kind"])
        return {
            "label": "entry_append",
            "confidence": 0.91,
            "reasons": reasons,
            "targetEntryId": duplicate_meta["id"],
            "targetEntryType": entry_type,
            "duplicateMatch": duplicate_meta,
            "topCandidates": [
                _base_candidate("entry_append", 0.91),
                _base_candidate("entry_discuss", 0.8),
                _base_candidate("entry_create", 0.6),
            ],
        }

    if in_window and has_pronoun_anchor:
        reasons.append("Within entry context window with pronoun reference")
        return {
            "label": "entry_discuss",
            "confidence": 0.96,
            "reasons": reasons,
            "targetEntryId": context_snapshot.get("entryId") if context_snapshot else None,
            "targetEntryType": context_snapshot.get("entryType") if context_snapshot else None,
            "duplicateMatch": duplicate_meta,
            "topCandidates": [
                _base_candidate("entry_discuss", 0.96),
                _base_candidate("entry_append", 0.82 if has_additive else 0.7),
                _base_candidate("entry_create", 0.6),
            ],
        }

    if duplicate_meta and not has_additive:
        reasons.append("High-similarity memory match without clear additive cue")

    has_save = _has_save_language(lower)
    has_temporal = _has_temporal_marker(lower)
    has_action = _has_action_language(lower)
    is_question = bool(QUESTION_MARK.search(trimmed))
    word_count = len([word for word in re.split(r"\s+", trimmed) if word])

    if not is_question and (has_save or (has_temporal and has_action) or word_count > 25):
        create_confidence = min(
            0.86 + (0.08 if has_save else 0) + (0.03 if has_temporal else 0) + (0.03 if word_count > 60 else 0),
            0.97,
        )
        reasons.append("Declarative content suitable for structured capture")
        if has_save:
            reasons.append("Explicit save/log intent detected")
        if has_temporal:
            reasons.append("Temporal marker detected")
        if has_action:
            reasons.append("Concrete action verb detected")

        return {
            "label": "entry_create",
            "confidence": create_confidence,
            "reasons": reasons,
            "targetEntryId": None,
            "duplicateMatch": duplicate_meta,
            "topCandidates": [
                _base_candidate("entry_create", create_confidence),
                _base_candidate("entry_append", 0.78 if duplicate_meta else 0.62),
                _base_candidate("conversational", 0.6),
            ],
        }

    if has_additive and duplicate_meta:
        reasons.append("Additive phrasing referencing prior context")
        return {
            "label": "entry_append",
            "confidence": 0.88,
            "reasons": reasons,
            "targetEntryId": duplicate_meta["id"],
            "targetEntryType": _map_kind_to_entry_type(duplicate_meta["kind"]),
            "duplicateMatch": duplicate_meta,
            "topCandidates": [
                _base_candidate("entry_append", 0.88),
                _base_candidate("entry_discuss", 0.72),
                _base_candidate("conversational", 0.65),
            ],
        }

    if in_window and not is_question:
        reasons.append("Context window active; defaulting follow-up to discuss")
        return {
            "label": "entry_discuss",
            "confidence": 0.78,
            "reasons": reasons,
            "targetEntryId": context_snapshot.get("entryId") if context_snapshot else None,
            "targetEntryType": context_snapshot.get("entryType") if context_snapshot else None,
            "duplicateMatch": duplicate_meta,
            "topCandidates": [
                _base_candidate("entry_discuss", 0.78),
                _base_candidate("entry_create", 0.6),
                _base_candidate("conversational", 0.58),
            ],
        }

    if duplicate_meta and len(duplicate_meta["text"]) >= DUPLICATE_MIN_PREFIX_LENGTH:
        duplicate_prefix = duplicate_meta["text"][:DUPLICATE_MIN_PREFIX_LENGTH].lower()
        recent_match = any(duplicate_prefix in message.text.lower() for message in recent)
        if recent_match:
            reasons.append("Recent message references similar content; favour append")
            return {
                "label": "entry_append",
                "confidence": 0.8,
                "reasons": reasons,
                "targetEntryId": duplicate_meta["id"],
                "targetEntryType": _map_kind_to_entry_type(duplicate_meta["kind"]),
                "duplicateMatch": duplicate_meta,
                "topCandidates": [
                    _base_candidate("entry_append", 0.8),
                    _base_candidate("entry_discuss", 0.7),
                    _base_candidate("conversational", 0.65),
                ],
            }

    conversational_confidence = 0.9 if is_question else 0.82
    if is_question:
        reasons.append("Question format leaning conversational")
    else:
        reasons.append("Defaulting to reflective conversational mode")

    return {
        "label": "conversational",
        "confidence": conversational_confidence,
        "reasons": reasons,
        "targetEntryId": context_snapshot.get("entryId") if context_snapshot and context_snapshot.get("isActive") else None,
        "targetEntryType": context_snapshot.get("entryType") if context_snapshot else None,
        "duplicateMatch": duplicate_meta,
        "topCandidates": [
            _base_candidate("conversational", conversational_confidence),
            _base_candidate("search_query", 0.58 if is_question else 0.4),
            _base_candidate("entry_create", 0.35),
        ],
    }


def to_native_label(label: str) -> str:
    return to_title_case(label.replace("_", " "))

