import { describe, it, expect, vi } from 'vitest';
import { handleUtterance } from '@/agent/pipeline';

// Mock all dependencies
vi.mock('@/agent/memory');
vi.mock('@/agent/userConfig');
vi.mock('@/agent/intentRouting');
vi.mock('@/agent/slotFiller');
vi.mock('@/agent/redactor');
vi.mock('@/services/goals.unified');
vi.mock('@/agent/coaching');

describe('Utterance Flow Integration', () => {
  it('should handle full utterance flow', async () => {
    const result = await handleUtterance('I feel stuck with my goals');
    expect(result).toHaveProperty('payload');
    expect(result.payload).toHaveProperty('userText');
  });
});
