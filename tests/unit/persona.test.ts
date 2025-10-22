import { describe, it, expect } from 'vitest';
import { computePersonaTag } from '@/utils/persona';

describe('Persona', () => {
  describe('computePersonaTag', () => {
    it('should compute tag', () => {
      const state = { goals: [], tone: 'neutral' };
      const result = computePersonaTag(state);
      expect(typeof result).toBe('string');
    });
  });
});
