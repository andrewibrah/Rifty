import asyncio
import time
from typing import Any, Dict, List, Optional

from .types import RouteDecision
from .utils.nanoid import nanoid

STORAGE_KEY = "riflett_traces_v2"
MAX_TRACES = 100

_storage_lock = asyncio.Lock()
_trace_store: List[Dict[str, Any]] = []


async def _with_storage_lock(task):
    async with _storage_lock:
        return await task()


async def _load_traces() -> List[Dict[str, Any]]:
    return list(_trace_store)


async def _save_traces(traces: List[Dict[str, Any]]) -> None:
    trimmed = sorted(traces, key=lambda trace: trace["ts"], reverse=True)[:MAX_TRACES]
    _trace_store.clear()
    _trace_store.extend(trimmed)


class Telemetry:
    @staticmethod
    async def record(params: Dict[str, Any]) -> str:
        async def _task():
            traces = await _load_traces()
            trace_id = nanoid()
            traces.insert(
                0,
                {
                    "id": trace_id,
                    "ts": int(time.time() * 1000),
                    "maskedUserText": params["maskedUserText"],
                    "intentLabel": params["intentLabel"],
                    "intentConfidence": params["intentConfidence"],
                    "decision": params["decision"],
                    "retrieval": params.get("retrieval", []),
                    "redactionSummary": params.get("redactionSummary", {}),
                    "latencyMs": int(time.time() * 1000) - params.get("startedAt", int(time.time() * 1000)),
                    "planner": None,
                    "action": None,
                },
            )
            await _save_traces(traces)
            return trace_id

        return await _with_storage_lock(_task)

    @staticmethod
    async def update(trace_id: str, patch: Dict[str, Any]) -> None:
        async def _task():
            traces = await _load_traces()
            next_traces: List[Dict[str, Any]] = []
            for trace in traces:
                if trace.get("id") == trace_id:
                    merged = {**trace, **patch}
                    next_traces.append(merged)
                else:
                    next_traces.append(trace)
            await _save_traces(next_traces)

        await _with_storage_lock(_task)

