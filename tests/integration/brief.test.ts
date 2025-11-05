import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IntentPayload } from '@/chat/handleMessage';

vi.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: {} },
    manifest2: { extra: {} },
  },
}));

vi.mock('expo-modules-core', () => ({
  __esModule: true,
  EventEmitter: class EventEmitter {},
  NativeModulesProxy: {},
}));

const globalAny = globalThis as typeof globalThis & { __DEV__?: boolean };
if (globalAny.__DEV__ === undefined) {
  globalAny.__DEV__ = false;
}

let buildBrief: typeof import('@/services/mainChat').buildBrief;
let synthesize: typeof import('@/services/mainChat').synthesize;

beforeAll(async () => {
  const module = await import('@/services/mainChat');
  buildBrief = module.buildBrief;
  synthesize = module.synthesize;
});

vi.mock('@/agent/memory', () => ({
  Memory: {
    getBrief: vi.fn().mockResolvedValue({
      operatingPicture: {
        why_model: null,
        top_goals: [],
        hot_entries: [],
        next_72h: [],
        cadence_profile: {
          cadence: 'daily',
          session_length_minutes: 25,
          last_message_at: null,
          missed_day_count: 0,
          current_streak: 0,
          timezone: 'UTC',
        },
        risk_flags: [],
      },
      rag: [],
    }),
  },
}));

const routedIntent: IntentPayload['routedIntent'] = {
  label: 'journal.create',
  rawLabel: 'journal.create',
  confidence: 0.9,
  slots: {},
  topK: [],
};

const mockIntent: IntentPayload = {
  text: 'help me plan focus time',
  decision: { kind: 'commit', primary: 'journal.create' },
  routedIntent,
  nativeIntent: {
    label: 'journal.create',
    confidence: 0.9,
    top3: [
      { label: 'journal.create', confidence: 0.9 },
      { label: 'journal.update', confidence: 0.05 },
      { label: 'journal.review', confidence: 0.05 },
    ],
    topK: [],
  },
  enriched: {
    userText: 'help me plan focus time',
    intent: routedIntent,
    contextSnippets: [],
    userConfig: {},
  },
  redaction: {
    masked: 'help me plan focus time',
    replacementMap: {},
  },
  memoryMatches: [],
  label: 'journal.create',
  confidence: 0.9,
  top3: [
    { label: 'journal.create', confidence: 0.9 },
    { label: 'journal.update', confidence: 0.05 },
    { label: 'journal.review', confidence: 0.05 },
  ],
  traceId: null,
};

describe('buildBrief + synthesize integration', () => {
  it('produces situational brief and synthesis with receipt scaffolding', async () => {
    if (!buildBrief || !synthesize) {
      throw new Error('mainChat module not initialized');
    }
    const brief = await buildBrief('user-123', mockIntent);
    const plan = synthesize(null, {
      operatingPicture: brief.operatingPicture,
      goalContext: brief.goalContext,
      retrieval: brief.retrieval,
      scheduleSuggestions: brief.scheduleSuggestions,
    });

    expect(plan.confidence.overall).toBeGreaterThan(0);
    expect(Array.isArray(brief.scheduleSuggestions)).toBe(true);
  });
});
