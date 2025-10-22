import { describe, it, expect, vi } from 'vitest';
import { embedText, generateEmbedding } from '@/agent/embeddings';

vi.mock('@/lib/supabase');

describe('Embeddings', () => {
  describe('embedText', () => {
    it('should generate embedding', async () => {
      const result = await embedText('test');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding via API', async () => {
      const result = await generateEmbedding('test');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
