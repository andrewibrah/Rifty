import re
import time
from dataclasses import dataclass
from typing import List, Optional

from .types import EntryType

MAX_SEMANTIC_TURNS = 10
DECAY_FACTOR = 0.6
MIN_ACTIVE_SCORE = 0.2


@dataclass
class WindowState:
    entryId: str
    entryType: EntryType | str
    createdAt: int
    decayScore: float


@dataclass
class RecentMessage:
    text: str
    ts: int
    score: float
    isReceipt: bool


state: Optional[WindowState] = None
recent_messages: List[RecentMessage] = []


def _compute_message_score(text: str) -> float:
    trimmed = text.strip().lower()
    if not trimmed:
        return 0.0
    tokens = [
        token
        for token in re.split(r"[^a-z0-9]+", trimmed, flags=re.IGNORECASE)
        if token
    ]
    if not tokens:
        return 0.0
    avg_length = sum(len(token) for token in tokens) / len(tokens)
    base = min(1.0, len(tokens) / 12.0)
    lexical = min(1.0, avg_length / 5.0)
    return min(1.0, base * 0.6 + lexical * 0.4)


def _is_receipt_message(text: str) -> bool:
    lowered = text.lower()
    return "receipt" in lowered or "confirmed" in lowered


def _prune_low_signal_messages() -> None:
    recent_messages.sort(key=lambda msg: msg.ts, reverse=True)
    preserved: List[RecentMessage] = []
    for message in recent_messages:
        if message.isReceipt:
            preserved.append(message)
            continue
        if len(preserved) < MAX_SEMANTIC_TURNS:
            preserved.append(message)
    preserved.sort(key=lambda msg: msg.ts)
    while len(preserved) > MAX_SEMANTIC_TURNS:
        preserved.pop(0)
    recent_messages.clear()
    recent_messages.extend(preserved)


def _apply_decay(created_entry: bool) -> None:
    global state
    if not state:
        return
    if created_entry:
        state.decayScore = 1
        state.createdAt = int(time.time() * 1000)
        return
    state.decayScore *= DECAY_FACTOR
    if state.decayScore < MIN_ACTIVE_SCORE:
        state = None


def register_entry(entry_id: str, entry_type: EntryType | str = "unknown") -> None:
    global state
    state = WindowState(
        entryId=entry_id,
        entryType=entry_type,
        createdAt=int(time.time() * 1000),
        decayScore=1.0,
    )


def refresh_entry(entry_id: str, entry_type: EntryType | str = "unknown") -> None:
    global state
    effective_type = entry_type if entry_type != "unknown" else state.entryType if state else "unknown"  # type: ignore[union-attr]
    state = WindowState(
        entryId=entry_id,
        entryType=effective_type,
        createdAt=int(time.time() * 1000),
        decayScore=1.0,
    )


def clear() -> None:
    global state
    state = None
    recent_messages.clear()


def snapshot() -> Optional[dict]:
    if not state:
        return None
    is_active = state.decayScore >= MIN_ACTIVE_SCORE
    return {
        "entryId": state.entryId,
        "entryType": state.entryType,
        "createdAt": state.createdAt,
        "decayScore": state.decayScore,
        "isActive": is_active,
    }


def record_user_message(text: str) -> None:
    global state
    if not text:
        return
    score = _compute_message_score(text)
    receipt = _is_receipt_message(text)
    message = RecentMessage(
        text=text,
        ts=int(time.time() * 1000),
        score=1 if receipt else score,
        isReceipt=receipt,
    )
    recent_messages.append(message)
    _prune_low_signal_messages()
    if state:
        state.decayScore = min(1.0, state.decayScore * DECAY_FACTOR + message.score * 0.5)
        if state.decayScore < MIN_ACTIVE_SCORE and not receipt:
            state = None


def recent() -> List[RecentMessage]:
    return recent_messages[-MAX_SEMANTIC_TURNS :]


def advance_turn(created_entry: bool) -> None:
    _apply_decay(created_entry)
