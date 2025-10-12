import { getIntentDefinition } from '@/constants/intents';
import { predictIntent } from '@/native/intent';
import type { NativeIntentResult } from '@/native/intent';
import { Memory } from '@/agent/memory';
import { SlotFiller } from '@/agent/slotFiller';
import type { SlotFillOptions } from '@/agent/slotFiller';
import { Redactor } from '@/agent/redactor';
import { UserConfig } from '@/agent/userConfig';
import { buildRoutedIntent, route } from '@/agent/intentRouting';
import { Telemetry } from '@/agent/telemetry';
import type { EnrichedPayload, RouteDecision, RoutedIntent } from '@/agent/types';

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

const KIND_MAP: Record<string, string[]> = {
  'journal entry': ['entry', 'pref'],
  'reflection request': ['entry', 'goal'],
  'goal create': ['goal', 'entry'],
  'goal check-in': ['goal'],
  'schedule create': ['event'],
  'reminder set': ['event'],
  'settings change': ['pref'],
};

const kindsFor = (label: string): string[] => {
  const key = label.toLowerCase();
  return KIND_MAP[key] ?? ['entry'];
};

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

  const nativeIntent = await predictIntent(trimmed);

  const baseRouted = buildRoutedIntent(nativeIntent);
  const slotOptions: SlotFillOptions = {};
  if (options.userTimeZone) {
    slotOptions.userTimeZone = options.userTimeZone;
  }
  const withSlots = SlotFiller.fill(trimmed, baseRouted, slotOptions);

  const searchKinds = options.kindsOverride ?? kindsFor(withSlots.rawLabel);
  const contextRecords = await Memory.searchTopN({
    query: trimmed,
    kinds: searchKinds,
    topK: options.topK ?? 5,
  });

  const redaction = Redactor.mask(trimmed);
  const userConfig = await ensureUserConfig(options.userConfig);

  const payload: EnrichedPayload = {
    userText: redaction.masked,
    intent: withSlots,
    contextSnippets: contextRecords.map((record) => record.text),
    userConfig,
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
