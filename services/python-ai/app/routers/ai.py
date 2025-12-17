from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..orchestrator import ai as orchestrator_ai
from ..orchestrator.context_heuristics import aggregate_modes, build_evidence, infer_likely_need
from ..orchestrator.embeddings import delete_entry_embedding, embed_entry, generate_embedding, get_entry_embedding, store_entry_embedding
from ..orchestrator.goals import add_micro_step, complete_micro_step, create_goal, delete_goal, get_goal_by_id, list_active_goals_with_context, list_goals, update_goal
from ..orchestrator.main_chat import generate_main_chat_reply
from ..orchestrator.model_registry import fetch_latest_model, list_model_evaluations, record_model_evaluation, register_model_version
from ..orchestrator.summarization import detect_goal, summarize_entry

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/respond")
async def respond(body: Dict[str, Any]) -> Dict[str, Any]:
    mode = body.get("mode") or "main_chat"
    if mode == "entry":
        return orchestrator_ai.generate_ai_response(body)
    intent = body.get("intent") or {}
    return await generate_main_chat_reply(
        {
            "userText": body.get("userText") or intent.get("text") or "",
            "intent": intent,
            "planner": body.get("planner"),
            "brief": body.get("brief"),
            "synthesis": body.get("synthesis"),
            "cachedOperatingPicture": body.get("cachedOperatingPicture"),
        }
    )


@router.post("/embed")
async def embed(body: Dict[str, Any]) -> Dict[str, Any]:
    if "entryId" in body and "content" in body:
        result = await embed_entry(body["entryId"], body.get("content", ""))
        return result
    if "entry_id" in body and "embedding" in body:
        return await store_entry_embedding(body)
    if "entryId" in body and body.get("delete"):
        await delete_entry_embedding(body["entryId"])
        return {"status": "deleted"}
    if "entryId" in body and body.get("get"):
        embedding = await get_entry_embedding(body["entryId"])
        return embedding or {}
    text = body.get("text") or body.get("content") or ""
    embedding = await generate_embedding(text)
    return {"embedding": embedding, "model": "text-embedding-3-small"}


@router.post("/summarize")
async def summarize(body: Dict[str, Any]) -> Dict[str, Any]:
    if body.get("mode") == "detect_goal":
        return detect_goal(body.get("content", ""))
    summary = summarize_entry(body.get("content", ""), body.get("entryType", ""), body.get("options"))
    return summary


@router.post("/goals")
async def goals(body: Dict[str, Any]) -> Any:
    op = body.get("operation") or "list"
    if op == "create":
        return await create_goal(body.get("params", {}))
    if op == "get":
        goal_id = body.get("goalId") or body.get("id")
        if not goal_id:
            raise HTTPException(status_code=400, detail="goalId required")
        return await get_goal_by_id(goal_id)
    if op == "list":
        return await list_goals(body.get("options") or {})
    if op == "update":
        goal_id = body.get("goalId")
        if not goal_id:
            raise HTTPException(status_code=400, detail="goalId required")
        return await update_goal(goal_id, body.get("updates") or {})
    if op == "delete":
        goal_id = body.get("goalId")
        if not goal_id:
            raise HTTPException(status_code=400, detail="goalId required")
        await delete_goal(goal_id)
        return {"status": "deleted"}
    if op == "complete_micro":
        return await complete_micro_step(body["goalId"], body["stepId"])
    if op == "add_micro":
        return await add_micro_step(body["goalId"], body["description"])
    if op == "list_active_with_context":
        return await list_active_goals_with_context(body.get("userId"), body.get("limit", 5))
    raise HTTPException(status_code=400, detail="Unsupported operation")


@router.post("/context-heuristics")
async def context_heuristics(body: Dict[str, Any]) -> Dict[str, Any]:
    likely = infer_likely_need(body.get("inputText", ""), body.get("dominantMood"), body.get("topTopic"))
    modes = aggregate_modes(body.get("entries", []))
    evidence = build_evidence(
        body.get("matches", []),
        body.get("edges", []),
        body.get("neighborNodes", {}),
        body.get("includeFatigue", []),
        body.get("threshold", 0.4),
    )
    return {"likely_need": likely, "modes": modes, "evidence": evidence}


@router.post("/model-registry")
async def model_registry(body: Dict[str, Any]) -> Any:
    op = body.get("operation")
    if op == "register":
        return register_model_version(body.get("payload", {}))
    if op == "record_evaluation":
        return record_model_evaluation(body.get("payload", {}))
    if op == "fetch_latest":
        return fetch_latest_model(body.get("modelName", ""))
    if op == "list_evaluations":
        return list_model_evaluations(body.get("modelId", ""))
    raise HTTPException(status_code=400, detail="Unsupported operation")

