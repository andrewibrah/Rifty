import { describe, it, expect } from 'vitest';
import { Redactor } from '@/agent/redactor';

describe('Redactor', () => {
  describe('mask', () => {
    it('should mask sensitive info', () => {
      const result = Redactor.mask('My email is test@example.com');
      expect(result.masked).toContain('[REDACTED]');
      expect(result.replacementMap).toBeDefined();
    });
  });
});
