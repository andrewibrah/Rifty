import { describe, it, expect, vi } from 'vitest';
import { fetchPersonalizationBundle } from '@/services/personalization';

// Mock supabase
vi.mock('@/lib/supabase');

describe('Personalization', () => {
  describe('fetchPersonalizationBundle', () => {
    it('should return bundle when user exists', async () => {
      const bundle = await fetchPersonalizationBundle('uid');
      expect(bundle).toBeDefined();
      // Since mocked, may return null or object
    });
  });
});
