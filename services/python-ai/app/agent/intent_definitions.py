from typing import Dict, List

from .types import EntryType


definitions: List[dict] = [
    {
        "id": "conversational",
        "label": "Conversational",
        "subsystem": "entries",
        "entryType": "journal",
        "allowedInEntryChat": True,
    },
    {
        "id": "entry_create",
        "label": "Entry Create",
        "subsystem": "entries",
        "entryType": "journal",
        "allowedInEntryChat": False,
    },
    {
        "id": "entry_discuss",
        "label": "Entry Discuss",
        "subsystem": "entries",
        "entryType": "journal",
        "allowedInEntryChat": True,
    },
    {
        "id": "entry_append",
        "label": "Entry Append",
        "subsystem": "entries",
        "entryType": "journal",
        "allowedInEntryChat": True,
    },
    {
        "id": "command",
        "label": "Command",
        "subsystem": "user_config",
        "allowedInEntryChat": False,
    },
    {
        "id": "search_query",
        "label": "Search Query",
        "subsystem": "knowledge",
        "allowedInEntryChat": True,
    },
]

lookup = {definition["label"].lower(): definition for definition in definitions}
by_id = {definition["id"]: definition for definition in definitions}

DEFAULT_INTENT = {
    "id": "conversational",
    "label": "Conversational",
    "subsystem": "entries",
    "entryType": "journal",
    "allowedInEntryChat": True,
}


def get_intent_definition(label: str) -> Dict:
    trimmed = label.strip()
    normalized = trimmed.lower()
    safe_label = "journal entry" if normalized in ("", "label") else normalized
    return lookup.get(safe_label, {**DEFAULT_INTENT, "id": "unknown", "label": trimmed or DEFAULT_INTENT["label"]})


def get_intent_by_id(intent: str) -> Dict:
    return by_id.get(intent, {**DEFAULT_INTENT, "id": intent, "label": intent})


entry_chat_allowed_intents = [
    definition["id"] for definition in definitions if definition["allowedInEntryChat"]
]

all_intent_definitions = definitions

