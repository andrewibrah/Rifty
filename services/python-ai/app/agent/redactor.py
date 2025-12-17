import re
from typing import Callable, Dict, Tuple

from .types import RedactionResult


class PatternConfig:
    def __init__(self, name: str, create_regex: Callable[[], re.Pattern], mask: Callable[[int], str], is_match_valid: Callable[[str], bool] | None = None) -> None:
        self.name = name
        self.create_regex = create_regex
        self.mask = mask
        self.is_match_valid = is_match_valid


PATTERNS = [
    PatternConfig(
        name="email",
        create_regex=lambda: re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
        mask=lambda i: f"[EMAIL_{i}]",
    ),
    PatternConfig(
        name="phone",
        create_regex=lambda: re.compile(r"(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,3}\)|\d{2,3})[\s-]?\d{3}[\s-]?\d{4}"),
        mask=lambda i: f"[PHONE_{i}]",
    ),
    PatternConfig(
        name="card",
        create_regex=lambda: re.compile(r"\b(?:\d[\s-]*){13,19}\d\b"),
        mask=lambda i: f"[CARD_{i}]",
        is_match_valid=lambda match: 13 <= len(re.sub(r"\D", "", match)) <= 19,
    ),
    PatternConfig(
        name="address",
        create_regex=lambda: re.compile(r"\b\d{1,5}\s+[^\n,]+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Place|Pl\.?)\b", flags=re.I),
        mask=lambda i: f"[ADDR_{i}]",
    ),
]


class Redactor:
    @staticmethod
    def mask(text: str) -> RedactionResult:
        if not text:
            return RedactionResult(masked=text, replacementMap={})

        masked = text
        replacement_map: Dict[str, str] = {}

        for pattern in PATTERNS:
            index = 0
            regex = pattern.create_regex()
            def _replacer(match: re.Match) -> str:
                nonlocal index
                value = match.group(0)
                if pattern.is_match_valid and not pattern.is_match_valid(value):
                    return value
                key = pattern.mask(index)
                replacement_map[key] = value
                index += 1
                return key
            masked = regex.sub(_replacer, masked)

        return RedactionResult(masked=masked, replacementMap=replacement_map)

    @staticmethod
    def unmask(text: str, mapping: Dict[str, str]) -> str:
        if not text:
            return text
        result = text
        for mask, value in mapping.items():
            result = result.replace(mask, value)
        return result

