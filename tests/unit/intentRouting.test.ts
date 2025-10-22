import { describe, it, expect, vi } from 'vitest';
import { buildRoutedIntent, route } from '@/agent/intentRouting';

vi.mock('@/constants/intents');

describe('IntentRouting', () => {
  describe('buildRoutedIntent', () => {
    it('should build routed intent', () => {
      const nativeIntent = {
        label: 'journal',
        confidence: 0.9,
        top3: [],
        topK: [],
        modelVersion: 'test',
        matchedTokens: [],
        tokens: [],
      };
      const result = buildRoutedIntent(nativeIntent);
      expect(result.label).toBe('journal');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('route', () => {
    it('should route intent', () => {
      const intent = { label: 'journal', confidence: 0.9, secondBest: null };
      const decision = route(intent);
      expect(decision).toBeDefined();
    });
  });
});
