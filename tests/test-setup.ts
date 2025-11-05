import { vi } from 'vitest';

type SupabaseResult<T = any> = Promise<{ data: T; error: any }>; 

const noopResult: SupabaseResult = Promise.resolve({ data: null, error: null });

const createQueryBuilder = () => {
  const builder: any = {
    select: () => builder,
    insert: () => noopResult,
    update: () => noopResult,
    delete: () => noopResult,
    upsert: () => noopResult,
    eq: () => builder,
    in: () => builder,
    limit: () => builder,
    order: () => builder,
    gte: () => builder,
    lte: () => builder,
    maybeSingle: () => noopResult,
    single: () => noopResult,
  };
  return builder;
};

vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      async getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      async setItem(key: string, value: string) {
        store.set(key, value);
      },
      async removeItem(key: string) {
        store.delete(key);
      },
      async clear() {
        store.clear();
      },
    },
  };
});

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        async getUser() {
          return { data: { user: { id: 'user-123' } }, error: null };
        },
        async getSession() {
          return { data: { session: { access_token: 'token' } }, error: null };
        },
      },
      from: () => createQueryBuilder(),
      rpc: async () => ({ data: null, error: null }),
      functions: {
        invoke: async () => ({ data: null, error: null }),
      },
    },
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
  };
});

vi.mock('@/services/personalization', () => ({
  fetchPersonalizationBundle: vi.fn(),
}));
