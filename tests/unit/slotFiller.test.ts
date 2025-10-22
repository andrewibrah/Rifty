import { describe, it, expect, vi } from 'vitest';
import { SlotFiller } from '@/agent/slotFiller';

vi.mock('@/constants/intents');

describe('SlotFiller', () => {
  describe('fill', () => {
    it('should fill slots', () => {
      const intent = { label: 'journal', confidence: 0.9 };
      const options = {};
      const result = SlotFiller.fill('Hello world', intent, options);
      expect(result.label).toBe('journal');
    });
  });
});
