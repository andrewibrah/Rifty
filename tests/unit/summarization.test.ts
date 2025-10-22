import { describe, it, expect, vi } from 'vitest';
import { getEntrySummary } from '@/services/summarization';

vi.mock('@/lib/supabase');

describe('Summarization', () => {
  describe('getEntrySummary', () => {
    it('should get summary', async () => {
      const result = await getEntrySummary('id');
      expect(result).toBeDefined();
    });
  });
});
