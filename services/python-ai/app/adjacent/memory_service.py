from typing import Any, Dict, List, Optional

from ..agent.memory import Memory
from ..agent.types import RoutedIntent


async def memory_search(body: Dict[str, Any]) -> List[Dict[str, Any]]:
    query = body.get("query", "")
    kinds = body.get("kinds") or []
    top_k = body.get("topK") or 5
    results = await Memory.search_top_n({"query": query, "kinds": kinds, "topK": top_k})
    return [record.__dict__ for record in results]


async def memory_brief(body: Dict[str, Any]) -> Dict[str, Any]:
    uid = body.get("uid")
    intent_payload = body.get("intent")
    routed = intent_payload if isinstance(intent_payload, RoutedIntent) else RoutedIntent(**intent_payload)
    query = body.get("query", "")
    options = body.get("options") or {}
    result = await Memory.get_brief(uid, routed, query, options)
    return result

