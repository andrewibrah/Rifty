import { gateRequest, generateFastPathResponse } from '../gate';

describe('Gating System', () => {
  describe('Intent Classification', () => {
    const testCases = [
      { message: 'Hello, how are you?', expectedIntent: 'small_talk', expectFastPath: true },
      { message: 'Schedule a meeting tomorrow', expectedIntent: 'scheduling', expectFastPath: true },
      { message: 'Tag this as important', expectedIntent: 'tag', expectFastPath: true },
      { message: 'Why do I feel this way?', expectedIntent: 'reflection', expectFastPath: false },
      { message: 'Analyze my spending patterns', expectedIntent: 'analysis', expectFastPath: false },
    ];

    testCases.forEach(({ message, expectedIntent, expectFastPath }) => {
      test(`should classify "${message}" as ${expectedIntent}`, async () => {
        const result = await gateRequest({ userMessage: message });
        
        expect(result.intent).toBe(expectedIntent);
        expect(result.route).toBe(expectFastPath ? 'fast_path' : 'gpt_thinking');
      });
    });
  });

  describe('Fast Path Responses', () => {
    test('should generate appropriate small talk response', () => {
      const gateResult = {
        route: 'fast_path' as const,
        confidence: 0.9,
        intent: 'small_talk' as const,
        reason: 'High confidence small talk',
      };

      const response = generateFastPathResponse(gateResult, {
        userMessage: 'Hi there!',
      });

      expect(response).toContain('Hello');
    });

    test('should generate scheduling response', () => {
      const gateResult = {
        route: 'fast_path' as const,
        confidence: 0.85,
        intent: 'scheduling' as const,
        reason: 'Scheduling intent detected',
      };

      const response = generateFastPathResponse(gateResult, {
        userMessage: 'Schedule something',
      });

      expect(response).toContain('scheduling');
    });
  });

  describe('Trivial Path Measurement', () => {
    // Mock test data representing typical usage
    const mockRequests = [
      'Hello',
      'How are you?',
      'Schedule a call',
      'Tag this entry',
      'Remind me tomorrow',
      'What is the meaning of life?', // Not trivial
      'Analyze my behavior patterns', // Not trivial
      'I need to plan my career', // Not trivial
    ];

    test('should route majority of trivial requests to fast path', async () => {
      let fastPathCount = 0;
      
      for (const message of mockRequests) {
        const result = await gateRequest({ userMessage: message });
        if (result.route === 'fast_path') {
          fastPathCount++;
        }
      }

      const fastPathPercentage = (fastPathCount / mockRequests.length) * 100;
      
      // Expect at least 50% of trivial requests to use fast path
      // (In real testing, this would be measured over many more samples)
      expect(fastPathPercentage).toBeGreaterThanOrEqual(50);
    });
  });
});
