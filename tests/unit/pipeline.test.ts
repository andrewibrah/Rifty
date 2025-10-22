import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreContextRecords, handleUtterance } from '@/agent/pipeline';
import { Memory } from '@/agent/memory';
import * as UserConfig from '@/agent/userConfig';

// Mock dependencies
vi.mock('@/agent/memory');
vi.mock('@/agent/userConfig');
vi.mock('@/agent/intentRouting');
vi.mock('@/agent/slotFiller');
vi.mock('@/agent/redactor');
vi.mock('@/services/goals.unified');
vi.mock('@/agent/coaching');

describe('Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scoreContextRecords', () => {
    it('should score records with default weights', () => {
      const records = [
        { id: '1', kind: 'entry', text: 'test', ts: Date.now(), score: 0.8, embedding: [0.1] },
      ];
      const scored = scoreContextRecords(records);
      expect(scored).toHaveLength(1);
      expect(scored[0]).toHaveProperty('compositeScore');
      expect(scored[0].scoring).toBeDefined();
    });

    it('should apply time-of-day boost', () => {
      const records = [
        { id: '1', kind: 'entry', text: 'test', ts: Date.now(), score: 0.8, embedding: [0.1] },
      ];
      const options = { userTimeZone: 'UTC' };
      const scored = scoreContextRecords(records, options);
      expect(scored[0].scoring.timeOfDay).toBeDefined();
    });

    it('should apply coaching boost for goal records', () => {
      const records = [
        { id: '1', kind: 'goal', text: 'test', ts: Date.now(), score: 0.8, embedding: [0.1] },
      ];
      const options = { coachingSuggestion: { type: 'goal_check' } };
      const scored = scoreContextRecords(records, options);
      expect(scored[0].scoring.coaching).toBeGreaterThan(0);
    });
  });

  describe('handleUtterance', () => {
    it('should process utterance and return result', async () => {
      // Mock implementations
      vi.mocked(Memory.searchTopN).mockResolvedValue([]);
      vi.mocked(UserConfig.ensureUserConfig).mockResolvedValue({
        user_settings: null,
        persona: null,
        cadence: 'none',
        tone: 'neutral',
        spiritual_on: false,
        bluntness: 5,
        privacy_gates: {},
        crisis_rules: {},
        resolved_at: new Date().toISOString(),
      });

      const result = await handleUtterance('Hello');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('routedIntent');
      expect(result).toHaveProperty('payload');
    });
  });
});
