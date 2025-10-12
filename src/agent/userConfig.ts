import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'riflett_user_config_v1';

let inMemoryCache: Record<string, unknown> | null = null;

export const UserConfig = {
  async snapshot(): Promise<Record<string, unknown>> {
    if (inMemoryCache) {
      return { ...inMemoryCache };
    }
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) {
        inMemoryCache = {};
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      inMemoryCache = parsed;
      return { ...parsed };
    } catch (error) {
      console.warn('[user-config] snapshot failed', error);
      inMemoryCache = {};
      return {};
    }
  },

  async update(patch: Record<string, unknown>): Promise<void> {
    const current = await this.snapshot();
    const next = { ...current, ...patch };
    inMemoryCache = next;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('[user-config] update failed', error);
    }
  },
};
