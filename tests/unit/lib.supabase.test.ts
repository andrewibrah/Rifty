import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockAsyncStorage = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

vi.mock('react-native-url-polyfill/auto', () => ({}), { virtual: true });

describe('supabase client env detection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.APP_ENV;
    delete process.env.NODE_ENV;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;
  });

  it('prefers explicit APP_ENV flag over __DEV__ heuristic', async () => {
    const createClient = vi.fn().mockReturnValue({ auth: {} });

    vi.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: {
            APP_ENV: 'production',
            SUPABASE_URL: 'https://prod.example',
            SUPABASE_ANON_KEY: 'anon-key',
          },
        },
      },
    }));

    vi.doMock('@supabase/supabase-js', () => ({
      __esModule: true,
      createClient,
    }));

    const module = await import('@/lib/supabase');
    expect(module.SUPABASE_URL).toBe('https://prod.example');
    expect(createClient).toHaveBeenCalledWith(
      'https://prod.example',
      'anon-key',
      expect.objectContaining({ auth: expect.any(Object) })
    );
  });
});
