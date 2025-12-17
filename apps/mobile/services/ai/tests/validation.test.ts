import { validateAgainstSchema, callWithRetry } from '../schemas/validator';

describe('Schema Validation', () => {
  describe('Reflection Schema', () => {
    test('should validate correct reflection object', () => {
      const validObject = {
        intent: 'reflection',
        emotion: 'thoughtful',
        one_line_mirror: 'You seem contemplative',
        next_action: 'plan',
      };

      const result = validateAgainstSchema('reflection', validObject);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid reflection object', () => {
      const invalidObject = {
        intent: 'invalid',
        emotion: 'thoughtful',
        one_line_mirror: 'You seem contemplative',
        next_action: 'plan',
      };

      const result = validateAgainstSchema('reflection', invalidObject);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Plan Schema', () => {
    test('should validate correct plan object', () => {
      const validObject = {
        intent: 'plan',
        goal: 'Achieve fitness goals',
        steps: ['Step 1', 'Step 2'],
        timeline: '3 months',
        resources_needed: ['Gym membership'],
      };

      const result = validateAgainstSchema('plan', validObject);
      expect(result.valid).toBe(true);
    });

    test('should reject plan with too many steps', () => {
      const invalidObject = {
        intent: 'plan',
        goal: 'Achieve fitness goals',
        steps: Array(15).fill('Step'), // Too many steps
        timeline: '3 months',
        resources_needed: ['Gym membership'],
      };

      const result = validateAgainstSchema('plan', invalidObject);
      expect(result.valid).toBe(false);
    });
  });

  describe('Retry Logic', () => {
    test('should retry on validation failure', async () => {
      let attempts = 0;
      
      const mockCall = async (retryHint?: string) => {
        attempts++;
        if (attempts === 1) {
          return { invalid: 'data' }; // Invalid on first attempt
        }
        return {
          intent: 'reflection',
          emotion: 'thoughtful',
          one_line_mirror: 'Valid response',
          next_action: 'plan',
        };
      };

      const result = await callWithRetry(mockCall, 2, (res) => validateAgainstSchema('reflection', res));
      
      expect(attempts).toBe(2);
      expect(result.intent).toBe('reflection');
    });

    test('should fail after max retries', async () => {
      const mockCall = async () => {
        return { invalid: 'data' };
      };

      await expect(
        callWithRetry(mockCall, 2, (res) => validateAgainstSchema('reflection', res))
      ).rejects.toThrow();
    });
  });
});
