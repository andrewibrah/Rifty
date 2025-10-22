// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { Telemetry } from '@/agent/telemetry';

const store: Record<string, string> = {};

// Monkey-patch AsyncStorage mock for deterministic behavior
const asyncStorage = require('@react-native-async-storage/async-storage').default;
(asyncStorage as any).setItem = async (key: string, value: string) => {
  store[key] = value;
};
(asyncStorage as any).getItem = async (key: string) => store[key] ?? null;
(asyncStorage as any).removeItem = async (key: string) => {
  delete store[key];
};

const sampleRetrieval = [
  {
    id: 'goal:123',
    kind: 'goal',
    compositeScore: 0.9,
    scoring: {
      recency: 0.8,
      priority: 1,
      semantic: 0.7,
      affect: 0.5,
      relationship: 0.85,
    },
  },
];

describe('Telemetry', () => {
  it('records masked text with redaction summary and retrieval details', async () => {
    const traceId = await Telemetry.record({
      maskedUserText: 'masked message',
      intentLabel: 'entry_create',
      intentConfidence: 0.92,
      decision: { kind: 'commit', primary: 'journal.create' },
      retrieval: sampleRetrieval,
      redactionSummary: { '[NAME]': 4 },
      startedAt: Date.now() - 50,
    });

    expect(typeof traceId).toBe('string');

    await Telemetry.update(traceId, {
      planner: {
        action: 'journal.create',
        ask: null,
        payloadPreview: '{"summary":"note"}',
      },
      confidence: {
        retrieval: 0.8,
        plan: 0.6,
        overall: 0.7,
      },
      receipts: ['goal:123 · Focus'],
    });

    const stored = JSON.parse(store['riflett_traces_v2'] ?? '[]') as Array<Record<string, any>>;
    expect(stored[0].maskedUserText).toBe('masked message');
    expect(stored[0].redactionSummary['[NAME]']).toBe(4);
    expect(stored[0].retrieval[0].kind).toBe('goal');
    expect(stored[0].confidence.overall).toBe(0.7);
  });
});
