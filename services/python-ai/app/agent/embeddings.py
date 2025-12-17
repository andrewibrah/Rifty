import math
from typing import Callable, Iterable, List, Optional

FALLBACK_DIMENSION = 384

Embedder = Callable[[str], Iterable[float]]

_custom_embedder: Optional[Embedder] = None


def l2_normalize(vector: Iterable[float]) -> List[float]:
    values = [float(v) for v in vector]
    norm = math.sqrt(sum(v * v for v in values))
    if not math.isfinite(norm) or norm <= 0:
        return [0.0 for _ in values] or [0.0] * FALLBACK_DIMENSION
    return [v / norm for v in values]


def _fallback_embed(text: str) -> List[float]:
    dim = FALLBACK_DIMENSION
    output = [0.0 for _ in range(dim)]
    raw_bytes = text.encode("utf-8", errors="ignore")

    prime = 16777619
    hash_value = 2166136261

    for index, byte in enumerate(raw_bytes):
        hash_value = (hash_value ^ byte) * prime
        idx = abs(hash_value + index * 31) % dim
        output[idx] += (byte / 255.0) * 2 - 1

    return l2_normalize(output)


async def embed_text(text: str) -> List[float]:
    if not text:
        dim = FALLBACK_DIMENSION
        if _custom_embedder:
            try:
                zeros = list(_custom_embedder(""))
                if zeros:
                    return l2_normalize(zeros)
            except Exception:
                pass
        return [0.0 for _ in range(dim)]

    if _custom_embedder:
        try:
            vector = list(_custom_embedder(text))
            if vector:
                return l2_normalize(vector)
        except Exception:
            # Fall back silently to the deterministic embedder.
            pass

    return _fallback_embed(text)


def set_custom_embedder(embedder: Optional[Embedder]) -> None:
    global _custom_embedder
    _custom_embedder = embedder

