import { Memory } from '@/agent/memory';
import { classifyRiflettIntent, toNativeLabel } from '@/agent/riflettIntentClassifier';

export interface NativeIntentResult {
  label: string;
  confidence: number;
  top3: { label: string; confidence: number }[];
  topK: { label: string; confidence: number }[];
  modelVersion?: string;
  matchedTokens?: { label: string; tokens: string[] }[];
  tokens?: string[];
}

const MODEL_VERSION = 'riflett-heuristic-2025-11-07';

const DEFAULT_NATIVE_RESULT: NativeIntentResult = {
  label: 'Conversational',
  confidence: 0.6,
  top3: [
    { label: 'Conversational', confidence: 0.6 },
    { label: 'Entry Create', confidence: 0.3 },
    { label: 'Search Query', confidence: 0.2 },
  ],
  topK: [
    { label: 'Conversational', confidence: 0.6 },
    { label: 'Entry Create', confidence: 0.3 },
    { label: 'Search Query', confidence: 0.2 },
  ],
  modelVersion: MODEL_VERSION,
  matchedTokens: [],
  tokens: [],
};

export async function predictIntent(text: string): Promise<NativeIntentResult> {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return DEFAULT_NATIVE_RESULT;
  }

  try {
    const contextRecords = await Memory.searchTopN({
      query: trimmed,
      kinds: ['entry', 'goal', 'event', 'pref'],
      topK: 5,
    });

    const classification = classifyRiflettIntent({
      text: trimmed,
      contextRecords,
    });

    const labelTitle = toNativeLabel(classification.label);
    const topK = classification.topCandidates.map((candidate) => ({
      label: toNativeLabel(candidate.label),
      confidence: candidate.confidence,
    }));

    return {
      label: labelTitle,
      confidence: classification.confidence,
      top3: topK.slice(0, 3),
      topK: topK.length ? topK : [{ label: labelTitle, confidence: classification.confidence }],
      modelVersion: MODEL_VERSION,
      matchedTokens: [],
      tokens: [],
    };
  } catch (error) {
    console.warn('[intent] heuristic prediction failed', error);
    return DEFAULT_NATIVE_RESULT;
  }
}
