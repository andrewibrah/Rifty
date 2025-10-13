const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'with',
  'about',
  'into',
  'is',
  'it',
  'be',
  'this',
  'that',
  'was',
  'were',
  'are',
  'am',
  'as',
  'but',
  'so',
  'if',
  'from',
  'by',
  'my',
  'me',
  'we',
  'our',
  'us',
  'you',
  "i",
]);

const WORD_REGEX = /[\p{Alphabetic}\p{Number}][\p{Alphabetic}\p{Number}\-']+/gu;

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = lower.match(WORD_REGEX) ?? [];
  const filtered: string[] = [];

  for (const token of tokens) {
    const normalized = token.replace(/^[^\p{Alphabetic}\p{Number}]+|[^\p{Alphabetic}\p{Number}]+$/gu, '');
    if (!normalized) continue;
    if (STOPWORDS.has(normalized)) continue;
    if (normalized.length <= 1) continue;
    filtered.push(normalized);
  }

  return filtered;
}

export function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }
  return result;
}
