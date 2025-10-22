// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserConfig } from '@/agent/userConfig';
import { fetchPersonalizationBundle } from '@/services/personalization';

vi.mock('@/services/personalization');

const mockedFetch = fetchPersonalizationBundle as unknown as vi.Mock;

beforeEach(async () => {
  mockedFetch.mockReset();
  await UserConfig.update({});
});

describe('UserConfig', () => {
  it('hot-reloads personalization bundle and notifies subscribers', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const unsubscribe = UserConfig.subscribe((snapshot) => {
      updates.push(snapshot);
    });

    mockedFetch.mockResolvedValueOnce({
      user_settings: {
        persona_tag: 'Architect',
        cadence: 'daily',
        language_intensity: 'direct',
        bluntness: 7,
        spiritual_prompts: true,
      },
      persona: 'Architect',
      cadence: 'daily',
      tone: 'direct',
      spiritual_on: true,
      bluntness: 7,
      privacy_gates: {},
      crisis_rules: {},
      resolved_at: new Date().toISOString(),
    });

    const config = await UserConfig.loadUserConfig('user-123');

    expect(config.persona).toBe('Architect');
    expect(config.tone).toBe('direct');

    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]?.persona).toBe('Architect');

    unsubscribe();
  });
});
