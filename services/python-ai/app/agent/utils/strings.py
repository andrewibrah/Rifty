import re


WORD_BOUNDARY = re.compile(r"[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]+|[0-9]+")


def to_snake_case(value: str) -> str:
    if not value:
        return ""
    trimmed = value.strip()
    matches = WORD_BOUNDARY.findall(trimmed)
    if not matches:
        return re.sub(r"\s+", "_", trimmed.lower())
    return "_".join(part.lower() for part in matches)


def to_title_case(value: str) -> str:
    if not value:
        return ""
    parts = re.split(r"[_\s]+", value)
    filtered = [part for part in parts if part]
    return " ".join(part[:1].upper() + part[1:].lower() for part in filtered)


def to_pascal_case(value: str) -> str:
    if not value:
        return ""
    return to_title_case(value).replace(" ", "")

