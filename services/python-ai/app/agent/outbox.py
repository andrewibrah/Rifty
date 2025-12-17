import asyncio
import time
from typing import Any, Dict, List, Literal, Optional

from .utils.nanoid import nanoid

OutboxJobKind = Literal["polish"]


class OutboxJob(Dict[str, Any]):
    id: str
    kind: OutboxJobKind
    payload: Dict[str, Any]
    createdAt: int


_storage: List[OutboxJob] = []
_queue_lock = asyncio.Lock()


async def _load_jobs() -> List[OutboxJob]:
    return list(_storage)


async def _save_jobs(jobs: List[OutboxJob]) -> None:
    _storage.clear()
    _storage.extend(jobs)


class Outbox:
    @staticmethod
    async def queue(job: Dict[str, Any]) -> OutboxJob:
        async with _queue_lock:
            current = await _load_jobs()
            payload: OutboxJob = {
                "id": job.get("id") or nanoid(),
                "kind": job["kind"],
                "payload": job["payload"],
                "createdAt": int(time.time() * 1000),
            }
            current.append(payload)
            await _save_jobs(current)
            return payload

    @staticmethod
    async def list() -> List[OutboxJob]:
        return await _load_jobs()

    @staticmethod
    async def clear(job_id: str) -> None:
        async with _queue_lock:
            jobs = await _load_jobs()
            filtered = [job for job in jobs if job.get("id") != job_id]
            await _save_jobs(filtered)

