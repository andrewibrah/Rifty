import { describe, it, expect, vi } from 'vitest';
import { generateEmbedding } from '@/services/embeddings';

vi.mock('@/constants/expo');

describe('Embeddings Service', () => {
  describe('generateEmbedding', () => {
    it('should generate embedding', async () => {
      const result = await generateEmbedding('test');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
