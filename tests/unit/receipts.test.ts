// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { buildReceiptsFooter } from '@/services/mainChat';
import type { SynthesisResult } from '@/services/mainChat';

const baseSynthesis: SynthesisResult = {
  diagnosis: 'baseline',
  levers: [],
  action: {
    title: 'noop',
    detail: 'none',
    receipts: {},
  },
  confidence: {
    retrieval: 0.5,
    plan: 0.5,
    overall: 0.5,
  },
};

describe('buildReceiptsFooter', () => {
  it('returns unique receipts combining levers and action', () => {
    const receipts = buildReceiptsFooter({
      ...baseSynthesis,
      levers: [
        { label: 'Focus goal', evidence: 'Do thing', receipt: 'goal:123' },
        { label: 'Reflect', evidence: 'Entry', receipt: 'entry:456' },
      ],
      action: {
        title: 'Book block',
        detail: 'Tomorrow',
        receipts: {
          start_at: '2025-10-21T10:00:00Z',
          goal_id: 'goal:123',
        },
      },
    });

    expect(receipts).toContain('goal:123 · Focus goal');
    expect(receipts).toContain('entry:456 · Reflect');
    expect(receipts).toContain('start_at:2025-10-21T10:00:00Z');
  });
});
