from typing import Any, Dict, Optional

from ..agent.intent_definitions import all_intent_definitions, entry_chat_allowed_intents, get_intent_by_id, get_intent_definition
from ..agent.utils.strings import to_title_case


def get_definition(payload: Dict[str, Any]) -> Dict[str, Any]:
    label = payload.get("label")
    intent_id = payload.get("id")
    if intent_id:
        definition = get_intent_by_id(intent_id)
    elif label:
        definition = get_intent_definition(label)
    else:
        definition = get_intent_definition("Conversational")
    return definition


def map_intent_to_entry_type(intent_id: str) -> str:
    definition = get_intent_by_id(intent_id)
    return definition.get("entryType") or "journal"


def is_entry_chat_allowed(intent_id: str) -> bool:
    return intent_id in entry_chat_allowed_intents

