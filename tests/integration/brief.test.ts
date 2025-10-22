// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { buildBrief, synthesize } from '@/services/mainChat';
import type { IntentPayload } from '@/chat/handleMessage';

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

const mockIntent = {
  text: 'help me plan focus time',
  decision: { kind: 'commit', primary: 'journal.create' },
  routedIntent: {
    label: 'journal.create',
    rawLabel: 'journal.create',
    confidence: 0.9,
    slots: {},
    topK: [],
  },
  memoryMatches: [],
  enriched: {
    contextSnippets: [],
    userConfig: {},
  },
  redaction: {
    masked: 'help me plan focus time',
    replacementMap: {},
  },
} as unknown as IntentPayload;

describe('buildBrief + synthesize integration', () => {
  it('produces situational brief and synthesis with receipt scaffolding', async () => {
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
