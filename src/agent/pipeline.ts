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
import { listActiveGoalsWithContext } from '@/services/goals.unified';
import type { GoalContextItem } from '@/types/goal';
import type { MemoryRecord } from '@/agent/memory';
import type { PersonalizationRuntime } from '@/types/personalization';

export interface HandleUtteranceOptions {
  uid?: string;
  userTimeZone?: string;
  topK?: number;
  userConfig?: Partial<PersonalizationRuntime>;
  kindsOverride?: string[];
  coachingSuggestion?: { type: 'goal_check' | 'reflection' | string } | null;
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

const CONFIG_REFRESH_WINDOW_MS = 5 * 60 * 1000;

const needsRefresh = (config: PersonalizationRuntime): boolean => {
  if (!config.user_settings && !config.persona) {
    return true;
  }
  const resolvedAt = Date.parse(config.resolved_at ?? '');
  if (Number.isNaN(resolvedAt)) {
    return true;
  }
  return Date.now() - resolvedAt > CONFIG_REFRESH_WINDOW_MS;
};

const toPayloadConfig = (
  config: PersonalizationRuntime
): Record<string, unknown> => ({
  ...config,
  user_settings: config.user_settings ?? null,
  privacy_gates: { ...config.privacy_gates },
  crisis_rules: { ...config.crisis_rules },
});

const GOAL_KEYWORDS = ['goal', 'goals', 'milestone', 'milestones', 'project', 'habit', 'plan'];

const shouldLoadGoalContext = (
  text: string,
  routedIntent: RoutedIntent,
  classification: ReturnType<typeof classifyRiflettIntent>
): boolean => {
  const normalizedText = text.toLowerCase();
  if (GOAL_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
    return true;
  }
  if (routedIntent.label.toLowerCase().includes('goal')) {
    return true;
  }
  const duplicateKind = classification.duplicateMatch?.kind?.toLowerCase() ?? '';
  if (duplicateKind === 'goal') {
    return true;
  }
  const targetType = classification.targetEntryType?.toLowerCase() ?? '';
  if (targetType === 'goal') {
    return true;
  }
  return false;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const logistic = (value: number): number => 1 / (1 + Math.exp(-value));

const priorityWeightByKind: Record<string, number> = {
  goal: 1,
  schedule: 0.75,
  entry: 0.55,
  event: 0.45,
  pref: 0.35,
};

const relationshipWeightByKind: Record<string, number> = {
  goal: 0.85,
  schedule: 0.7,
  entry: 0.5,
  event: 0.4,
  pref: 0.35,
};

interface ScoredMemoryRecord extends MemoryRecord {
  compositeScore: number;
  scoring: {
    recency: number;
    priority: number;
    semantic: number;
    affect: number;
    relationship: number;
    timeOfDay: number;
    coaching: number;
  };
}

type ScoreContextOptions = {
  userTimeZone?: string;
  coachingSuggestion?: { type: 'goal_check' | 'reflection' | string } | null;
};

export const scoreContextRecords = (
  records: MemoryRecord[],
  options?: ScoreContextOptions
): ScoredMemoryRecord[] => {
  if (!records.length) return [];

  const timestamps = records.map((record) => record.ts ?? 0);
  const meanTs = timestamps.reduce((sum, value) => sum + value, 0) / timestamps.length;
  const variance = timestamps.reduce((sum, ts) => sum + (ts - meanTs) ** 2, 0) / timestamps.length;
  const stdTs = Math.sqrt(variance) || 1;

  return records
    .map((record) => {
      const recencyZ = (record.ts - meanTs) / stdTs;
      const recencyScore = logistic(recencyZ);
      const priority = priorityWeightByKind[record.kind] ?? 0.4;
      const semantic = clamp01((record.score + 1) / 2);
      const affect = 0.5;
      const relationship = relationshipWeightByKind[record.kind] ?? 0.4;

      // Time-of-day relevance
      let timeOfDayScore = 0.5;
      if (options?.userTimeZone) {
        try {
          const recordDate = record.ts ? new Date(record.ts) : null;
          const now = new Date();
          if (recordDate) {
            const formatter = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              hour12: false,
              timeZone: options.userTimeZone,
            });
            const recordHour = Number(formatter.format(recordDate));
            const nowHour = Number(formatter.format(now));
            const hourDiff = Math.min(Math.abs(recordHour - nowHour), 24 - Math.abs(recordHour - nowHour));
            timeOfDayScore = Math.max(0, 1 - hourDiff / 12);
          }
        } catch (error) {
          // Ignore timezone formatting issues
        }
      }

      let coachingScore = 0.5;
      const suggestionType = options?.coachingSuggestion?.type ?? null;
      if (suggestionType) {
        if (suggestionType === 'goal_check') {
          coachingScore = record.kind === 'goal' ? 1 : 0.35;
        } else if (suggestionType === 'reflection') {
          coachingScore = record.kind === 'entry' ? 1 : 0.35;
        } else {
          coachingScore = 0.6;
        }
      }

      const normalizedTimeOfDay = clamp01(timeOfDayScore);
      const normalizedCoaching = clamp01(coachingScore);

      const composite =
        0.3 * recencyScore +
        0.25 * priority +
        0.15 * semantic +
        0.1 * affect +
        0.1 * relationship +
        0.05 * normalizedTimeOfDay +
        0.05 * normalizedCoaching;

      return {
        ...record,
        compositeScore: composite,
        scoring: {
          recency: Number(recencyScore.toFixed(3)),
          priority: Number(priority.toFixed(3)),
          semantic: Number(semantic.toFixed(3)),
          affect: Number(affect.toFixed(3)),
          relationship: Number(relationship.toFixed(3)),
          timeOfDay: Number(normalizedTimeOfDay.toFixed(3)),
          coaching: Number(normalizedCoaching.toFixed(3)),
        },
      } satisfies ScoredMemoryRecord;
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);
};

const summarizeRedactions = (map: Record<string, string>): Record<string, number> => {
  return Object.entries(map).reduce<Record<string, number>>((acc, [placeholder, value]) => {
    acc[placeholder] = typeof value === 'string' ? value.length : 0;
    return acc;
  }, {});
};

const ensureUserConfig = async (
  override?: Partial<PersonalizationRuntime>
): Promise<PersonalizationRuntime> => {
  if (override && Object.keys(override).length > 0) {
    await UserConfig.update(override);
    return UserConfig.snapshot();
  }
  const snapshot = await UserConfig.snapshot();
  if (needsRefresh(snapshot)) {
    return UserConfig.loadUserConfig();
  }
  return snapshot;
};

export async function handleUtterance(
  text: string,
  optionsInput?: HandleUtteranceOptions | null
): Promise<HandleUtteranceResult> {
  const options: HandleUtteranceOptions = optionsInput ?? {};
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

  const contextOptions: ScoreContextOptions | undefined =
    options.userTimeZone || options.coachingSuggestion
      ? {
          ...(options.userTimeZone ? { userTimeZone: options.userTimeZone } : {}),
          ...(options.coachingSuggestion ? { coachingSuggestion: options.coachingSuggestion } : {}),
        }
      : undefined;

  const scoredContextRecords = scoreContextRecords(contextRecords, contextOptions);

  const telemetryRetrieval = scoredContextRecords.map((record) => ({
    id: record.id,
    kind: record.kind,
    compositeScore: Number(record.compositeScore.toFixed(3)),
    scoring: record.scoring,
  }));

  const classification = classifyRiflettIntent({
    text: trimmed,
    contextRecords: scoredContextRecords,
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
  const runtimeUserConfig = await ensureUserConfig(options.userConfig);
  const userConfig = toPayloadConfig(runtimeUserConfig);

  let goalContext: GoalContextItem[] | undefined;
  try {
    if (shouldLoadGoalContext(trimmed, withSlots, classification)) {
      goalContext = await listActiveGoalsWithContext();
    }
  } catch (goalError) {
    console.warn('[pipeline] goal context fetch failed', goalError);
  }

  const payload: EnrichedPayload = {
    userText: redaction.masked,
    intent: withSlots,
    contextSnippets: scoredContextRecords.map((record) => record.text),
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

  if (goalContext && goalContext.length > 0) {
    payload.goalContext = goalContext;
  }

  const decision = route(withSlots);

  let traceId: string | null = null;
  try {
    traceId = await Telemetry.record({
      maskedUserText: redaction.masked,
      intentLabel: withSlots.label,
      intentConfidence: withSlots.confidence,
      decision,
      retrieval: telemetryRetrieval,
      redactionSummary: summarizeRedactions(redaction.replacementMap),
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
    contextRecords: scoredContextRecords,
    traceId,
  };
}

export function summarizeIntent(intent: RoutedIntent): string {
  const definition = getIntentDefinition(intent.label);
  const secondary = intent.secondBest && intent.secondConfidence ? ` → ${intent.secondBest} (${Math.round(intent.secondConfidence * 100)}%)` : '';
  return `${definition.label} (${Math.round(intent.confidence * 100)}%)${secondary}`;
}
