import { describe, it, expect } from 'vitest';
import type { MemoryRecord, MemoryKind } from '@/agent/memory';
import { scoreContextRecords } from '@/agent/pipeline';

const createRecord = (id: string, kind: MemoryKind, ts: number, score: number): MemoryRecord => ({
  id,
  kind,
  text: `record-${id}`,
  ts,
  embedding: [] as number[],
  score,
});

describe('scoreContextRecords', () => {
  it('ranks records using composite scoring weights', () => {
    const records = scoreContextRecords([
      createRecord('goal-1', 'goal', Date.now() - 1_000, 0.9),
      createRecord('entry-1', 'entry', Date.now() - 10_000, 0.8),
      createRecord('pref-1', 'pref', Date.now() - 5_000, 0.4),
    ]);

    expect(records[0]?.id).toBe('goal-1');
    expect(records[1]?.id).toBe('entry-1');
    expect(records[0]?.scoring.priority).toBeGreaterThan(records[2]?.scoring.priority ?? 0);
  });
});
