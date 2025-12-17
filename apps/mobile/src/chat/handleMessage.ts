import type { HandleUtteranceOptions } from '@/agent/pipeline';
import { handleUtterance } from '@/agent/pipeline';
import type { MemoryRecord } from '@/agent/memory';
import type { RouteDecision, RoutedIntent, EnrichedPayload, RedactionResult } from '@/agent/types';
import type { NativeIntentResult } from '@/native/intent';

export interface IntentPayload {
  text: string;
  decision: RouteDecision;
  routedIntent: RoutedIntent;
  nativeIntent: NativeIntentResult;
  enriched: EnrichedPayload;
  redaction: RedactionResult;
  memoryMatches: MemoryRecord[];
  label: string;
  confidence: number;
  top3: { label: string; confidence: number }[];
  traceId: string | null;
}

export async function handleMessage(
  userText: string,
  options?: HandleUtteranceOptions
): Promise<IntentPayload> {
  const text = userText.trim();
  if (!text) {
    throw new Error('Message text is empty');
  }

  const result = await handleUtterance(text, options);

  return {
    text,
    decision: result.decision,
    routedIntent: result.routedIntent,
    nativeIntent: result.nativeIntent,
    enriched: result.payload,
    redaction: result.redaction,
    memoryMatches: result.contextRecords,
    label: result.nativeIntent.label,
    confidence: result.nativeIntent.confidence,
    top3: result.nativeIntent.top3,
    traceId: result.traceId,
  };
}
