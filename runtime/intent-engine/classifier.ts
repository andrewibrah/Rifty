import { INTENT_MODEL } from './model';
import { tokenize, uniqueTokens } from './tokenizer';
import type {
  IntentLabelDefinition,
  RuntimeIntentCandidate,
  RuntimeIntentResult,
} from './types';

const MAX_TOP_RESULTS = 5;

const { labels, logPriors, tokenLogLikelihoods, unseenTokenPenalty } = INTENT_MODEL;

function scoreLabel(
  label: IntentLabelDefinition,
  tokens: string[]
): RuntimeIntentCandidate {
  const perTokenMap = tokenLogLikelihoods[label.id] ?? {};
  let score = logPriors[label.id] ?? Math.log(1 / labels.length);
  const matchedTokens: string[] = [];

  for (const token of tokens) {
    const weight = perTokenMap[token];
    if (typeof weight === 'number') {
      matchedTokens.push(token);
      score += weight;
    } else {
      score += unseenTokenPenalty;
    }
  }

  return {
    id: label.id,
    label: label.display,
    confidence: 0,
    logScore: score,
    matchedTokens,
  };
}

function normaliseScores(candidates: RuntimeIntentCandidate[]): RuntimeIntentCandidate[] {
  if (candidates.length === 0) return [];
  const maxScore = Math.max(...candidates.map((c) => c.logScore));
  const expScores = candidates.map((c) => Math.exp(c.logScore - maxScore));
  const sum = expScores.reduce((acc, value) => acc + value, 0);

  return candidates.map((candidate, idx) => ({
    ...candidate,
    confidence: sum > 0 ? (expScores[idx] ?? 0) / sum : 0,
  }));
}

export function classifyIntent(text: string): RuntimeIntentResult {
  const start = Date.now();
  const rawTokens = tokenize(text);
  const tokens = uniqueTokens(rawTokens);

  const scored = labels.map((label) => scoreLabel(label, tokens));
  const withConf = normaliseScores(scored);
  const sorted = withConf.sort((a, b) => b.confidence - a.confidence);
  const topK = sorted.slice(0, MAX_TOP_RESULTS);
  const primary = topK[0] ?? {
    id: labels[0]?.id ?? 'journal_entry',
    label: labels[0]?.display ?? 'Journal Entry',
    confidence: 1,
    logScore: 0,
    matchedTokens: [],
  };

  return {
    primary,
    topK,
    modelVersion: INTENT_MODEL.version,
    inferenceMs: Date.now() - start,
    tokens,
  };
}
