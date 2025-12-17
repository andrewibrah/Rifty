from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..adjacent.intent_service import get_definition, is_entry_chat_allowed, map_intent_to_entry_type
from ..adjacent.memory_service import memory_brief, memory_search
from ..adjacent.personalization_service import export_personalization, fetch_personalization_bundle, persist_personalization
from ..adjacent.persona import compute_persona_tag
from ..adjacent.schedules import suggest_blocks, suggest_schedule_blocks

router = APIRouter(prefix="", tags=["adjacent"])


@router.post("/schedules/suggest")
async def suggest_schedules(body: Dict[str, Any]) -> Any:
    if body.get("mode") == "blocks":
        return suggest_schedule_blocks(body)
    goal_id = body.get("goalId") or body.get("goal_id")
    operating_picture = body.get("operatingPicture")
    return suggest_blocks(body.get("uid"), goal_id, operating_picture)


@router.post("/personalization/bundle")
async def personalization_bundle(body: Dict[str, Any]) -> Any:
    uid = body.get("uid")
    bundle = fetch_personalization_bundle(uid)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not available")
    return bundle


@router.post("/personalization/persist")
async def personalization_persist(body: Dict[str, Any]) -> Any:
    state = body.get("state")
    options = body.get("options") or {}
    if not state:
        raise HTTPException(status_code=400, detail="state required")
    from ..schemas.personalization import PersonalizationState

    persona_tag = persist_personalization(PersonalizationState(**state), options)
    return {"persona_tag": persona_tag}


@router.get("/personalization/export")
async def personalization_export() -> Any:
    return export_personalization()


@router.post("/memory/search")
async def memory_search_endpoint(body: Dict[str, Any]) -> Any:
    return await memory_search(body)


@router.post("/memory/brief")
async def memory_brief_endpoint(body: Dict[str, Any]) -> Any:
    return await memory_brief(body)


@router.post("/persona/tag")
async def persona_tag(body: Dict[str, Any]) -> Any:
    state = body.get("state")
    if not state:
        raise HTTPException(status_code=400, detail="state required")
    from ..schemas.personalization import PersonalizationState

    tag = compute_persona_tag(PersonalizationState(**state))
    return {"persona_tag": tag}


@router.post("/intent/definition")
async def intent_definition(body: Dict[str, Any]) -> Any:
    definition = get_definition(body)
    entry_allowed = is_entry_chat_allowed(definition["id"])
    entry_type = map_intent_to_entry_type(definition["id"])
    return {"definition": definition, "entryChatAllowed": entry_allowed, "entryType": entry_type}

