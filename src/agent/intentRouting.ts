import { getIntentDefinition } from '@/constants/intents';
import type { NativeIntentResult } from '@/native/intent';
import { toSnakeCase, toPascalCase } from '@/utils/strings';
import type { RouteDecision, RoutedIntent } from './types';

export const ROUTE_AT_THRESHOLD = 0.75;
export const CLARIFY_LOWER_THRESHOLD = 0.45;
export const SECONDARY_INTENT_THRESHOLD = 0.6;

const ROUTE_AT = ROUTE_AT_THRESHOLD;
const CLARIFY_LOWER = CLARIFY_LOWER_THRESHOLD;
const SECONDARY_THRESHOLD = SECONDARY_INTENT_THRESHOLD;

type ScoredLabel = { label: string; confidence: number };

const clamp = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const normalizeTopK = (nativeTopK: ScoredLabel[] | undefined): ScoredLabel[] => {
  if (!Array.isArray(nativeTopK)) return [];
  const seen = new Set<string>();
  return nativeTopK
    .filter((item): item is ScoredLabel =>
      Boolean(item && typeof item.label === 'string' && typeof item.confidence === 'number')
    )
    .map((item) => ({
      label: item.label,
      confidence: clamp(item.confidence),
    }))
    .filter((item) => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence);
};

export function buildRoutedIntent(
  nativeIntent: NativeIntentResult,
  slots: Record<string, string> = {}
): RoutedIntent {
  const topK = normalizeTopK(nativeIntent.topK ?? nativeIntent.top3);
  const primary = topK[0] ?? { label: nativeIntent.label, confidence: clamp(nativeIntent.confidence) };

  const second = topK.find((candidate) => candidate.label !== primary.label);
  const primaryDefinition = getIntentDefinition(primary.label);
  const secondDefinition = second ? getIntentDefinition(second.label) : null;

  return {
    label: toPascalCase(primaryDefinition.label),
    rawLabel: primaryDefinition.label,
    confidence: clamp(primary.confidence),
    secondBest: secondDefinition ? toPascalCase(secondDefinition.label) : null,
    secondConfidence: second ? clamp(second.confidence) : null,
    slots,
    topK: topK.length ? topK : [primary],
  };
}

export function route(intent: RoutedIntent): RouteDecision {
  if (intent.confidence >= ROUTE_AT) {
    const maybeSecondary =
      intent.secondBest && (intent.secondConfidence ?? 0) >= SECONDARY_THRESHOLD
        ? intent.secondBest
        : null;
    return {
      kind: 'commit',
      primary: intent.label,
      maybeSecondary,
    };
  }

  if (intent.confidence >= CLARIFY_LOWER) {
    const humanLabel = toSnakeCase(intent.label).replace(/_/g, ' ');
    return {
      kind: 'clarify',
      question: `Did you want to ${humanLabel}?`,
    };
  }

  return { kind: 'fallback' };
}

export function shouldConsiderSecondary(intent: RoutedIntent): boolean {
  return (intent.secondConfidence ?? 0) >= SECONDARY_THRESHOLD;
}
