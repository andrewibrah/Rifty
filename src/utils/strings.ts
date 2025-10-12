const WORD_BOUNDARY = /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]+|[0-9]+/g;

export function toSnakeCase(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const matches = trimmed.match(WORD_BOUNDARY);
  if (!matches) {
    return trimmed.toLowerCase().replace(/\s+/g, '_');
  }
  return matches.map((word) => word.toLowerCase()).join('_');
}

export function toTitleCase(input: string): string {
  if (!input) return '';
  return input
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function toPascalCase(input: string): string {
  if (!input) return '';
  return toTitleCase(input).replace(/\s+/g, '');
}
