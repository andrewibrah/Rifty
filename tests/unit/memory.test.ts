import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Memory } from '@/agent/memory';
import { getOperatingPicture } from '@/services/memory';

// Mock dependencies
vi.mock('@/lib/supabase');
vi.mock('@/agent/embeddings');
vi.mock('@/services/memory');

describe('Memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchTopN', () => {
    it('should search and return records', async () => {
      vi.mocked(getOperatingPicture).mockResolvedValue({
        why_model: null,
        top_goals: [],
        hot_entries: [],
        next_72h: [],
        cadence_profile: {
          cadence: 'none',
          session_length_minutes: 25,
          last_message_at: null,
          missed_day_count: 0,
          current_streak: 0,
          timezone: 'UTC',
        },
        risk_flags: [],
      });

      const options = { query: 'test', kinds: ['entry'], topK: 5 };
      const result = await Memory.searchTopN(options);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBrief', () => {
    it('should get operating picture and rag', async () => {
      vi.mocked(getOperatingPicture).mockResolvedValue({
        why_model: null,
        top_goals: [],
        hot_entries: [],
        next_72h: [],
        cadence_profile: {
          cadence: 'none',
          session_length_minutes: 25,
          last_message_at: null,
          missed_day_count: 0,
          current_streak: 0,
          timezone: 'UTC',
        },
        risk_flags: [],
      });

      const result = await Memory.getBrief('uid', { label: 'journal' }, 'query');
      expect(result).toHaveProperty('operatingPicture');
      expect(result).toHaveProperty('rag');
    });
  });
});
