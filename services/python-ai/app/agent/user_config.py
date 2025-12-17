import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Set

from ..schemas.personalization import PersonalizationRuntime

STORAGE_VERSION = 1

RuntimeConfig = PersonalizationRuntime
Listener = Callable[[RuntimeConfig], None]

_in_memory_cache: Optional[RuntimeConfig] = None
_listeners: Set[Listener] = set()
_lock = asyncio.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_runtime() -> RuntimeConfig:
    return PersonalizationRuntime(
        user_settings=None,
        persona=None,
        cadence="none",
        tone="neutral",
        spiritual_on=False,
        bluntness=5,
        privacy_gates={},
        crisis_rules={},
        resolved_at=_now_iso(),
    )


def _clone_config(config: RuntimeConfig) -> RuntimeConfig:
    return PersonalizationRuntime(**config.model_dump())


def _notify_listeners(config: RuntimeConfig) -> None:
    if not _listeners:
        return
    snapshot = _clone_config(config)
    for listener in list(_listeners):
        try:
            listener(snapshot)
        except Exception:
            # Listener errors are non-fatal.
            continue


def _normalize_runtime(candidate: Optional[Dict[str, Any]]) -> RuntimeConfig:
    if not candidate:
        return _default_runtime()
    try:
        runtime = PersonalizationRuntime(**candidate)
        return runtime
    except Exception:
        return _default_runtime()


async def _read_from_storage() -> RuntimeConfig:
    if _in_memory_cache:
        return _clone_config(_in_memory_cache)
    return _default_runtime()


def _merge_configs(current: RuntimeConfig, patch: Dict[str, Any]) -> RuntimeConfig:
    merged = current.model_dump()
    merged.update(patch)
    merged["user_settings"] = patch.get("user_settings", merged.get("user_settings")) or None
    merged["privacy_gates"] = {**(merged.get("privacy_gates") or {}), **(patch.get("privacy_gates") or {})}
    merged["crisis_rules"] = {**(merged.get("crisis_rules") or {}), **(patch.get("crisis_rules") or {})}
    merged["resolved_at"] = patch.get("resolved_at") or _now_iso()
    return _normalize_runtime(merged)


class UserConfig:
    @staticmethod
    async def snapshot() -> RuntimeConfig:
        async with _lock:
            global _in_memory_cache
            if _in_memory_cache:
                return _clone_config(_in_memory_cache)
            from_storage = await _read_from_storage()
            _in_memory_cache = _normalize_runtime(from_storage.model_dump())
            return _clone_config(_in_memory_cache)

    @staticmethod
    async def update(patch: Dict[str, Any]) -> None:
        async with _lock:
            current = await UserConfig.snapshot()
            next_config = _merge_configs(current, patch)
            globals()["_in_memory_cache"] = next_config
        _notify_listeners(next_config)

    @staticmethod
    async def load_user_config(user_id: Optional[str] = None) -> RuntimeConfig:
        # Remote fetch is stubbed; fall back to cached snapshot.
        try:
            existing = await UserConfig.snapshot()
            return existing
        except Exception:
            return _default_runtime()

    @staticmethod
    def subscribe(on_change: Listener) -> Callable[[], None]:
        _listeners.add(on_change)
        if _in_memory_cache:
            try:
                on_change(_clone_config(_in_memory_cache))
            except Exception:
                pass

        def unsubscribe():
            _listeners.discard(on_change)

        return unsubscribe


def subscribe_user_config(on_change: Listener) -> Callable[[], None]:
    return UserConfig.subscribe(on_change)

