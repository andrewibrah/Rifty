import { describe, it, expect } from 'vitest';
import { Redactor } from '@/agent/redactor';

describe('Redactor', () => {
  describe('mask', () => {
    it('masks email addresses', () => {
      const result = Redactor.mask('My email is test@example.com');
      expect(result.masked).toContain('[EMAIL_0]');
      expect(result.replacementMap['[EMAIL_0]']).toBe('test@example.com');
    });

    it('masks credit card numbers across separators', () => {
      const text = 'Use card 4242-4242-4242-4242 for the payment.';
      const result = Redactor.mask(text);
      expect(result.masked).toContain('[CARD_0]');
      expect(result.replacementMap['[CARD_0]']).toBe('4242-4242-4242-4242');
    });

    it('ignores short digit sequences that are not cards', () => {
      const text = 'The confirmation code 123-456 should stay visible.';
      const result = Redactor.mask(text);
      expect(result.masked).toContain('123-456');
      expect(Object.keys(result.replacementMap)).not.toContain('[CARD_0]');
    });
  });
});
