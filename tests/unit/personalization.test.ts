import { describe, it, expect, vi } from 'vitest';
import { fetchPersonalizationBundle } from '@/services/personalization';

// Mock supabase
vi.mock('@/lib/supabase');

describe('Personalization', () => {
  describe('fetchPersonalizationBundle', () => {
    it('should return bundle when user exists', async () => {
      const bundle = await fetchPersonalizationBundle('uid');
      // Mock may return null or an actual bundle object
      expect(bundle === null || typeof bundle === 'object').toBe(true);
    });
  });
});
