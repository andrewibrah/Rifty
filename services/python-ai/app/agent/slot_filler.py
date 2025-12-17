import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, TypedDict

from .types import RoutedIntent
from .utils.strings import to_title_case

WEEKDAY_ORDER = {
    "sunday": 0,
    "monday": 1,
    "tuesday": 2,
    "wednesday": 3,
    "thursday": 4,
    "friday": 5,
    "saturday": 6,
}

MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]


class SlotFillOptions(TypedDict, total=False):
    userTimeZone: str
    now: datetime


def _clamp_value(value: int, max_value: int) -> int:
    if not isinstance(value, int):
        return 0
    if value < 0:
        return 0
    if value > max_value:
        return max_value
    return value


def _minutes_to_iso(date: datetime) -> str:
    return date.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _resolve_now(now: Optional[datetime]) -> datetime:
    return datetime.fromisoformat(now.isoformat()) if now else datetime.now(timezone.utc)


def _find_weekday(text: str, now: datetime) -> Dict[str, datetime]:
    match = re.search(r"\b(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b", text, flags=re.I)
    if not match:
        return {}
    hint, weekday_raw = match.groups()
    weekday_idx = WEEKDAY_ORDER.get((weekday_raw or "").lower())
    if weekday_idx is None:
        return {}
    today_idx = now.weekday() if hasattr(now, "weekday") else datetime.now(timezone.utc).weekday()
    days_ahead = (weekday_idx - today_idx + 7) % 7
    if days_ahead == 0 and hint and hint.lower() == "next":
        days_ahead = 7
    elif days_ahead == 0 and hint and hint.lower() == "this":
        days_ahead = 0
    elif days_ahead == 0 and not hint:
        days_ahead = 7
    target = now + timedelta(days=days_ahead)
    return {"date": target}


def _find_relative_day(text: str, now: datetime) -> Dict[str, datetime]:
    if re.search(r"\btoday\b", text, flags=re.I):
        return {"date": now}
    if re.search(r"\btomorrow\b", text, flags=re.I):
        return {"date": now + timedelta(days=1)}
    if re.search(r"\bday after tomorrow\b", text, flags=re.I):
        return {"date": now + timedelta(days=2)}
    return {}


def _find_explicit_date(text: str, now: datetime) -> Dict[str, datetime]:
    iso_match = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", text)
    if iso_match:
        year, month, day = iso_match.groups()
        return {"date": datetime(int(year), int(month), int(day), tzinfo=timezone.utc)}
    slash_match = re.search(r"\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b", text)
    if slash_match:
        month_raw, day_raw, year_raw = slash_match.groups()
        year_val = int(f"20{year_raw}") if year_raw and len(year_raw) == 2 else int(year_raw or now.year)
        return {"date": datetime(year_val, int(month_raw), int(day_raw), tzinfo=timezone.utc)}
    month_match = re.search(r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b", text, flags=re.I)
    if month_match:
        month_raw, day_raw, year_raw = month_match.groups()
        month_idx = MONTHS.index(month_raw.lower()) if month_raw else -1
        if month_idx >= 0:
            year_val = int(year_raw) if year_raw else now.year
            return {"date": datetime(year_val, month_idx + 1, int(day_raw), tzinfo=timezone.utc)}
    return {}


def _apply_time(text: str, seed: Optional[datetime], now: datetime) -> Dict[str, datetime | bool]:
    match = re.search(r"\b(?:at|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", text, flags=re.I)
    if not match:
        return {}
    hour_raw, minute_raw, meridiem_raw = match.groups()
    hours = _clamp_value(int(hour_raw), 23)
    minutes = _clamp_value(int(minute_raw) if minute_raw else 0, 59)
    if meridiem_raw:
        meridiem = meridiem_raw.lower()
        if meridiem == "pm" and hours < 12:
            hours += 12
        if meridiem == "am" and hours == 12:
            hours = 0
    base = datetime.fromisoformat(seed.isoformat()) if seed else now
    base = base.replace(hour=hours, minute=minutes, second=0, microsecond=0)
    return {"date": base, "timeApplied": True}


def _ensure_past_is_future(date: datetime, now: datetime) -> datetime:
    if date < now:
        return date + timedelta(days=7)
    return date


def _derive_slots(text: str, base_intent: RoutedIntent, options: Optional[SlotFillOptions]) -> Dict[str, str]:
    now = _resolve_now(options.get("now") if options else None)
    result_slots: Dict[str, str] = deepcopy(base_intent.slots)
    normalized_label = (base_intent.rawLabel or base_intent.label).lower()

    weekday = _find_weekday(text, now)
    relative = _find_relative_day(text, now)
    explicit = _find_explicit_date(text, now)
    candidate_date = explicit.get("date") or relative.get("date") or weekday.get("date")

    if not candidate_date and re.search(r"\btonight\b", text, flags=re.I):
        candidate_date = now.replace(hour=20, minute=0, second=0, microsecond=0)

    time_applied = _apply_time(text, candidate_date or now, now)
    if time_applied.get("date"):
        candidate_date = time_applied["date"]  # type: ignore[assignment]

    if candidate_date:
        adjusted = _ensure_past_is_future(candidate_date, now) if "schedule" in base_intent.label.lower() else candidate_date
        iso = _minutes_to_iso(adjusted)
        if "schedule" in normalized_label:
            result_slots["start"] = iso
            if not time_applied.get("timeApplied"):
                end = adjusted + timedelta(hours=1)
                result_slots["end"] = _minutes_to_iso(end)
        elif "goal" in normalized_label:
            date_part = iso.split("T")[0]
            if date_part:
                result_slots["due"] = date_part
        elif "journal" in normalized_label:
            result_slots["ts"] = iso

    duration_match = re.search(r"for\s+(\d{1,2})\s*(minutes?|hours?)", text, flags=re.I)
    if duration_match:
        qty_raw, unit_raw = duration_match.groups()
        qty = int(qty_raw)
        unit = 60 if unit_raw and unit_raw.lower().startswith("hour") else 1
        minutes = qty * unit
        result_slots["duration_minutes"] = str(minutes)

    if "title" not in result_slots and "goal" in normalized_label:
        match = re.search(r"(?:goal|aim|plan)\s+(?:to|is to)?\s*(.+)$", text, flags=re.I)
        if match and match.group(1):
            result_slots["title"] = to_title_case(match.group(1).strip())

    if "title" not in result_slots and "journal" in normalized_label:
        title_match = re.search(r"(?:about|on)\s+([^.!?]+)", text, flags=re.I)
        if title_match and title_match.group(1):
            result_slots["title"] = to_title_case(title_match.group(1).strip())

    return result_slots


def fill(text: str, intent: RoutedIntent, options: Optional[SlotFillOptions] = None) -> RoutedIntent:
    slots = _derive_slots(text, intent, options)
    return RoutedIntent(**{**intent.model_dump(), "slots": slots})
