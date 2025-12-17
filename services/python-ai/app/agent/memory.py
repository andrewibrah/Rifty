import time
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

from .embeddings import embed_text, l2_normalize
from .types import RoutedIntent

MemoryKind = Literal["entry", "goal", "event", "pref", "schedule"]
RagKind = Literal["entry", "goal", "schedule"]
RagScopeInput = RagKind | List[RagKind] | Literal["all"]

MAX_CACHED_ROWS = 512
REMOTE_BRIEF_LIMIT = 9

_memory_cache: Dict[str, "MemoryRow"] = {}
_rag_results: List[Dict[str, object]] = []
_operating_picture: Optional[Dict[str, object]] = None
_user_id: Optional[str] = None


@dataclass
class MemoryRow:
    id: str
    kind: MemoryKind
    text: str
    ts: int
    embedding: List[float]


@dataclass
class MemoryRecord(MemoryRow):
    score: float


def set_authenticated_user(user_id: Optional[str]) -> None:
    global _user_id
    _user_id = user_id


def seed_rag_results(results: List[Dict[str, object]]) -> None:
    global _rag_results
    _rag_results = results


def seed_operating_picture(picture: Optional[Dict[str, object]]) -> None:
    global _operating_picture
    _operating_picture = picture


async def resolve_user_id() -> Optional[str]:
    return _user_id


def _map_kinds_to_rag(kinds: List[str]) -> List[RagKind]:
    normalized = {kind.lower() for kind in kinds}
    mapped: List[RagKind] = []
    if {"entry", "journal", "pref"} & normalized:
        mapped.append("entry")
    if "goal" in normalized:
        mapped.append("goal")
    if {"schedule", "event"} & normalized:
        mapped.append("schedule")
    return mapped


def _infer_scope_from_intent(intent: Optional[RoutedIntent]) -> RagScopeInput:
    if not intent:
        return "all"
    label = (intent.label or "").lower()
    scopes: List[RagKind] = []
    if "goal" in label:
        scopes.append("goal")
    if "schedule" in label or "calendar" in label:
        scopes.append("schedule")
    if not scopes or "journal" in label or "reflect" in label:
        scopes.append("entry")
    return scopes or "all"


def _cosine_scores(query: List[float], rows: List[MemoryRow]) -> List[MemoryRecord]:
    normalized_query = l2_normalize(query)
    scores: List[MemoryRecord] = []
    for row in rows:
        embedding = row.embedding
        length = min(len(normalized_query), len(embedding))
        dot = sum(normalized_query[i] * embedding[i] for i in range(length))
        scores.append(MemoryRecord(**row.__dict__, score=dot))
    return sorted(scores, key=lambda record: record.score, reverse=True)


async def _rag_search(user_id: str, query: str, scope: RagScopeInput = "all", options: Optional[Dict[str, object]] = None) -> List[Dict[str, object]]:
    trimmed = query.strip()
    if not trimmed:
        return []
    limit = options.get("limit") if options else None
    results = list(_rag_results)
    if isinstance(limit, int):
        results = results[:limit]
    return [
        {
            "id": str(item.get("id", "")),
            "kind": item.get("kind", "entry"),
            "score": float(item.get("score", 0)),
            "title": item.get("title"),
            "snippet": str(item.get("snippet", "")),
            "metadata": item.get("metadata") or {},
        }
        for item in results
    ]


async def _get_operating_picture(user_id: str) -> Optional[Dict[str, object]]:
    return _operating_picture


def _default_operating_picture() -> Dict[str, object]:
    return {
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


class Memory:
    @staticmethod
    async def search_top_n(options: Dict[str, object]) -> List[MemoryRecord]:
        query = str(options.get("query", "")).strip()
        if not query:
            return []
        top_k = max(1, min(int(options.get("topK", 5)), 20))
        kinds = [kind.lower() for kind in options.get("kinds", [])] if isinstance(options.get("kinds"), list) else []
        user_id = await resolve_user_id()

        if user_id:
            try:
                scope_kinds = _map_kinds_to_rag(kinds)
                rag_scope = scope_kinds if scope_kinds else "all"
                rag_results = await _rag_search(user_id, query, rag_scope, {"limit": top_k})
                if rag_results:
                    now_ts = int(time.time() * 1000)
                    remote_records: List[MemoryRecord] = []
                    for index, result in enumerate(rag_results):
                        text = result.get("snippet") or ""
                        embedding = await embed_text(text)
                        record = MemoryRecord(
                            id=f"{result.get('kind')}:{result.get('id')}",
                            kind=result.get("kind", "entry"),  # type: ignore[arg-type]
                            text=text,
                            ts=now_ts - index,
                            embedding=embedding,
                            score=float(result.get("score", 0)),
                        )
                        remote_records.append(record)
                        try:
                            await Memory.upsert(
                                {"id": record.id, "kind": record.kind, "text": record.text, "ts": record.ts, "embedding": record.embedding}
                            )
                        except Exception:
                            pass
                    return remote_records[:top_k]
            except Exception:
                pass

        query_vector = await embed_text(query)
        rows = [row for row in _memory_cache.values() if not kinds or row.kind.lower() in kinds]
        return _cosine_scores(query_vector, rows)[:top_k]

    @staticmethod
    async def get_brief(uid: Optional[str], intent: RoutedIntent, query: str, options: Optional[Dict[str, object]] = None):
        user_id = uid or await resolve_user_id()
        if not user_id:
            raise ValueError("User not authenticated")

        limit = max(3, min(int(options.get("limit", REMOTE_BRIEF_LIMIT)) if options else REMOTE_BRIEF_LIMIT, REMOTE_BRIEF_LIMIT))

        operating_picture = options.get("cachedOperatingPicture") if options else None
        if operating_picture is None:
            try:
                operating_picture = await _get_operating_picture(user_id)
            except Exception:
                operating_picture = None

        if operating_picture is None:
            operating_picture = _default_operating_picture()

        rag_results = await _rag_search(user_id, query, _infer_scope_from_intent(intent), {"limit": limit})
        memory_records: List[MemoryRecord] = []
        now_ts = int(time.time() * 1000)

        for index, result in enumerate(rag_results):
            text = result.get("snippet") or ""
            try:
                embedding = await embed_text(text)
            except Exception:
                embedding = []
            record = MemoryRecord(
                id=f"{result.get('kind')}:{result.get('id')}",
                kind=result.get("kind", "entry"),  # type: ignore[arg-type]
                text=text,
                ts=now_ts - index,
                embedding=embedding,
                score=float(result.get("score", 0)),
            )
            memory_records.append(record)
            try:
                await Memory.upsert(
                    {"id": record.id, "kind": record.kind, "text": record.text, "ts": record.ts, "embedding": record.embedding}
                )
            except Exception:
                pass

        return {"operatingPicture": operating_picture, "rag": rag_results, "memoryRecords": memory_records}

    @staticmethod
    async def upsert(options: Dict[str, object]) -> None:
        ts = int(options.get("ts", int(time.time() * 1000)))
        embedding = options.get("embedding") or await embed_text(str(options.get("text", "")))
        normalized = l2_normalize(embedding)
        row = MemoryRow(
            id=str(options["id"]),
            kind=options["kind"],  # type: ignore[arg-type]
            text=str(options.get("text", "")),
            ts=ts,
            embedding=normalized,
        )
        _memory_cache[row.id] = row
        if len(_memory_cache) > MAX_CACHED_ROWS:
            oldest = sorted(_memory_cache.values(), key=lambda value: value.ts, reverse=True)[:MAX_CACHED_ROWS]
            _memory_cache.clear()
            _memory_cache.update({row.id: row for row in oldest})

    @staticmethod
    async def remove(row_id: str) -> None:
        _memory_cache.pop(row_id, None)

    @staticmethod
    async def warmup() -> None:
        await embed_text("hi")


MemorySearchResult = List[MemoryRecord]
