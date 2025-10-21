import { getIntentDefinition } from '@/constants/intents';
import type { NativeIntentResult } from '@/native/intent';
import { Memory } from '@/agent/memory';
import { SlotFiller } from '@/agent/slotFiller';
import type { SlotFillOptions } from '@/agent/slotFiller';
import { Redactor } from '@/agent/redactor';
import { UserConfig } from '@/agent/userConfig';
import { buildRoutedIntent, route } from '@/agent/intentRouting';
import { Telemetry } from '@/agent/telemetry';
import type { EnrichedPayload, RouteDecision, RoutedIntent } from '@/agent/types';
import { classifyRiflettIntent, toNativeLabel } from './riflettIntentClassifier';

export interface HandleUtteranceOptions {
  userTimeZone?: string;
  topK?: number;
  userConfig?: Record<string, unknown>;
  kindsOverride?: string[];
}

export interface HandleUtteranceResult {
  decision: RouteDecision;
  routedIntent: RoutedIntent;
  nativeIntent: NativeIntentResult;
  payload: EnrichedPayload;
  redaction: ReturnType<typeof Redactor.mask>;
  contextRecords: Awaited<ReturnType<typeof Memory.searchTopN>>;
  traceId: string | null;
}

const ensureUserConfig = async (
  override?: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  if (override) return override;
  return UserConfig.snapshot();
};

export async function handleUtterance(
  text: string,
  options: HandleUtteranceOptions = {}
): Promise<HandleUtteranceResult> {
  const startedAt = Date.now();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Utterance text is empty');
  }

  const searchKinds = options.kindsOverride ?? ['entry', 'goal', 'event', 'pref'];
  const contextRecords = await Memory.searchTopN({
    query: trimmed,
    kinds: searchKinds,
    topK: options.topK ?? 5,
  });

  const classification = classifyRiflettIntent({
    text: trimmed,
    contextRecords,
  });

  const nativeIntent: NativeIntentResult = {
    label: toNativeLabel(classification.label),
    confidence: classification.confidence,
    top3: classification.topCandidates.slice(0, 3).map((candidate) => ({
      label: toNativeLabel(candidate.label),
      confidence: candidate.confidence,
    })),
    topK: classification.topCandidates.map((candidate) => ({
      label: toNativeLabel(candidate.label),
      confidence: candidate.confidence,
    })),
    modelVersion: 'riflett-heuristic-2025-11-07',
    matchedTokens: [],
    tokens: [],
  };

  const baseRouted = buildRoutedIntent(nativeIntent);
  const slotOptions: SlotFillOptions = {};
  if (options.userTimeZone) {
    slotOptions.userTimeZone = options.userTimeZone;
  }
  const withSlots = SlotFiller.fill(trimmed, baseRouted, slotOptions);

  const redaction = Redactor.mask(trimmed);
  const userConfig = await ensureUserConfig(options.userConfig);

  const payload: EnrichedPayload = {
    userText: redaction.masked,
    intent: withSlots,
    contextSnippets: contextRecords.map((record) => record.text),
    userConfig,
    classification: {
      id: classification.label,
      label: toNativeLabel(classification.label),
      confidence: classification.confidence,
      reasons: classification.reasons,
      targetEntryId: classification.targetEntryId ?? null,
      targetEntryType: classification.targetEntryType ?? null,
      duplicateMatch: classification.duplicateMatch ?? null,
      topCandidates: classification.topCandidates.map((candidate) => ({
        label: toNativeLabel(candidate.label),
        confidence: candidate.confidence,
      })),
    },
  };

  const decision = route(withSlots);

  let traceId: string | null = null;
  try {
    traceId = await Telemetry.record({
      userText: trimmed,
      intent: withSlots,
      decision,
      plan: null,
      startedAt,
    });
  } catch (error) {
    console.warn('[telemetry] record failed', error);
  }

  return {
    decision,
    routedIntent: withSlots,
    nativeIntent,
    payload,
    redaction,
    contextRecords,
    traceId,
  };
}

export function summarizeIntent(intent: RoutedIntent): string {
  const definition = getIntentDefinition(intent.label);
  const secondary = intent.secondBest && intent.secondConfidence ? ` → ${intent.secondBest} (${Math.round(intent.secondConfidence * 100)}%)` : '';
  return `${definition.label} (${Math.round(intent.confidence * 100)}%)${secondary}`;
}
