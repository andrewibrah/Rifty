import { describe, it, expect, vi } from 'vitest';
import { getJournalEntryById } from '@/services/data';

vi.mock('@/lib/supabase');

describe('Data', () => {
  describe('getJournalEntryById', () => {
    it('should get entry', async () => {
      const result = await getJournalEntryById('123e4567-e89b-12d3-a456-426614174000');
      expect(result).toBeDefined();
    });
  });
});
