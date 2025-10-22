import { describe, it, expect, vi } from 'vitest';
import { getJournalEntryById } from '@/services/data';

vi.mock('@/lib/supabase');

describe('Data', () => {
  describe('getJournalEntryById', () => {
    it('should get entry', async () => {
      const result = await getJournalEntryById('id');
      expect(result).toBeDefined();
    });
  });
});
