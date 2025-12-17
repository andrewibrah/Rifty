import asyncio
import time
from dataclasses import dataclass
from typing import Dict, Generic, Optional, TypeVar

T = TypeVar("T")


@dataclass
class CacheEntry(Generic[T]):
    value: T
    expires_at: float


STORAGE_PREFIX = "riflett_cache:"


def _hash_string(value: str) -> str:
    hash_value = 0
    for char in value:
        hash_value = (hash_value << 5) - hash_value + ord(char)
        hash_value &= 0xFFFFFFFF
    return str(hash_value & 0xFFFFFFFF)


def _build_key(raw: str) -> str:
    return f"{STORAGE_PREFIX}{_hash_string(raw)}"


class _EdgeCache:
    def __init__(self) -> None:
        self._store: Dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()

    async def get(self, raw_key: str) -> Optional[T]:
        key = _build_key(raw_key)
        async with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            if entry.expires_at < time.time() * 1000:
                self._store.pop(key, None)
                return None
            return entry.value

    async def set(self, raw_key: str, value: T, ttl_ms: int) -> None:
        key = _build_key(raw_key)
        expires_at = time.time() * 1000 + ttl_ms
        entry = CacheEntry(value=value, expires_at=expires_at)
        async with self._lock:
            # Store a JSON roundtrip to mirror the TS serialization behavior.
            self._store[key] = entry


EdgeCache = _EdgeCache()
