import { describe, it, expect } from 'vitest';
import { classifyRiflettIntent } from '@/agent/riflettIntentClassifier';

describe('RiflettIntentClassifier', () => {
  describe('classifyRiflettIntent', () => {
    it('should classify intent', () => {
      const contextRecords = [];
      const result = classifyRiflettIntent({ text: 'Hello', contextRecords });
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('confidence');
    });
  });
});
