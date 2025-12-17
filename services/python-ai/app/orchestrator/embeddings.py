from typing import Any, Dict, List

from ..agent.embeddings import embed_text


EMBEDDING_MODEL = "text-embedding-3-small"
_entry_embeddings: Dict[str, Dict[str, Any]] = {}


async def generate_embedding(text: str) -> List[float]:
    return await embed_text(text)


async def store_entry_embedding(params: Dict[str, Any]) -> Dict[str, Any]:
    embedding = params.get("embedding") or await generate_embedding(params.get("content", ""))
    model = params.get("model") or EMBEDDING_MODEL
    payload = {
        "id": params.get("id") or params.get("entry_id"),
        "entry_id": params.get("entry_id"),
        "user_id": params.get("user_id") or "user-stub",
        "embedding": embedding,
        "model": model,
        "created_at": "",
    }
    _entry_embeddings[payload["entry_id"]] = payload
    return payload


async def embed_entry(entry_id: str, content: str) -> Dict[str, Any]:
    return await store_entry_embedding({"entry_id": entry_id, "content": content})


async def get_entry_embedding(entry_id: str) -> Dict[str, Any] | None:
    return _entry_embeddings.get(entry_id)


async def delete_entry_embedding(entry_id: str) -> None:
    _entry_embeddings.pop(entry_id, None)

