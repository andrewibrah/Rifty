import {
  getIntentDefinition,
  getIntentById,
  type AppIntent,
  entryChatAllowedIntents,
} from "../constants/intents";
import type { EntryType } from "../services/data";
import type { IntentPredictionResult } from "../types/intent";
import {
  predictIntent as nativePredictIntent,
  type NativeIntentResult,
} from "../native/intent";

const clampConfidence = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function buildPredictionFromNative(
  nativeResult: NativeIntentResult
): IntentPredictionResult {
  const definition = getIntentDefinition(nativeResult.label);

  const probabilities = nativeResult.top3.reduce<Record<string, number>>(
    (acc, item) => {
      const bounded = clampConfidence(item.confidence ?? 0);
      acc[item.label] = bounded;
      return acc;
    },
    {}
  );

  if (!probabilities[definition.label]) {
    probabilities[definition.label] = clampConfidence(nativeResult.confidence);
  }

  return {
    ...definition,
    rawLabel: nativeResult.label,
    confidence: clampConfidence(nativeResult.confidence),
    probabilities,
  };
}

export async function predictIntent(
  text: string
): Promise<IntentPredictionResult> {
  try {
    const nativeResult = await nativePredictIntent(text);
    return buildPredictionFromNative(nativeResult);
  } catch (error) {
    console.warn("[intent] native prediction failed", error);
    const fallback = getIntentDefinition("Conversational");
    return {
      ...fallback,
      rawLabel: fallback.label,
      confidence: 0,
      probabilities: { [fallback.label]: 1 },
    };
  }
}

export function isEntryChatAllowed(intent: AppIntent): boolean {
  return entryChatAllowedIntents.includes(intent);
}

export function mapIntentToEntryType(intent: AppIntent): EntryType {
  const definition = getIntentById(intent);
  return definition.entryType ?? "journal";
}

export function isHighConfidence(confidence: number): boolean {
  return confidence >= 0.65;
}
