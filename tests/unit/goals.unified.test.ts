import { describe, it, expect, vi } from 'vitest';
import { listActiveGoalsWithContext } from '@/services/goals.unified';

vi.mock('@/lib/supabase');

describe('Goals Unified', () => {
  describe('listActiveGoalsWithContext', () => {
    it('should list goals', async () => {
      const result = await listActiveGoalsWithContext();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
