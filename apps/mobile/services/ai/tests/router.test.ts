import { cognitionRouter } from '../router';
import { gateRequest } from '../gate';

describe('CognitionRouter', () => {
  describe('Persona Selection', () => {
    const testCases = [
      { intent: 'reflection', expectedPersona: 'mirror' },
      { intent: 'analysis', expectedPersona: 'analyst' },
      { intent: 'scheduling', expectedPersona: 'scheduler' },
      { intent: 'small_talk', expectedPersona: 'coach' },
      { intent: 'planning', expectedPersona: 'coach' },
    ];

    testCases.forEach(({ intent, expectedPersona }) => {
      test(`should select ${expectedPersona} for ${intent}`, async () => {
        const input = {
          userMessage: 'Test message',
          context: {
            annotations: [],
            entryContent: 'Test entry',
            entryType: 'journal',
          },
        };

        const result = await cognitionRouter.route(input);
        
        expect(result.diagnostics.persona).toBe(expectedPersona);
      });
    });
  });

  describe('Gating Integration', () => {
    test('should route trivial requests to fast path', async () => {
      const input = {
        userMessage: 'Hello, how are you?',
        context: {
          annotations: [],
          entryContent: 'Test',
          entryType: 'journal',
        },
      };

      const result = await cognitionRouter.route(input);
      
      expect(result.diagnostics.gate.route).toBe('fast_path');
      expect(result.response).toContain('Hello');
    });

    test('should route complex requests to GPT thinking', async () => {
      const input = {
        userMessage: 'I need to analyze my spending patterns over the last year',
        context: {
          annotations: [],
          entryContent: 'Test',
          entryType: 'journal',
        },
      };

      const result = await cognitionRouter.route(input);
      
      expect(result.diagnostics.gate.route).toBe('gpt_thinking');
    });
  });

  describe('Pipeline Integration', () => {
    test('should return structured response', async () => {
      const input = {
        userMessage: 'Help me reflect on my goals',
        context: {
          annotations: [],
          entryContent: 'Test entry',
          entryType: 'journal',
        },
      };

      const result = await cognitionRouter.route(input);
      
      expect(result.version).toBe('cognition.v1');
      expect(typeof result.response).toBe('string');
      expect(Array.isArray(result.actions)).toBe(true);
      expect(result.diagnostics).toBeDefined();
    });
  });
});
