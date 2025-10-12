import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const STORAGE_PREFIX = 'riflett_cache:';

const hashString = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `${hash >>> 0}`;
};

const buildKey = (raw: string): string => `${STORAGE_PREFIX}${hashString(raw)}`;

export const EdgeCache = {
  async get<T>(rawKey: string): Promise<T | null> {
    const key = buildKey(rawKey);
    try {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as CacheEntry<T>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.expiresAt < Date.now()) {
        await AsyncStorage.removeItem(key);
        return null;
      }
      return parsed.value;
    } catch (error) {
      console.warn('[cache] get failed', error);
      return null;
    }
  },

  async set<T>(rawKey: string, value: T, ttlMs: number): Promise<void> {
    const key = buildKey(rawKey);
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    try {
      await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.warn('[cache] set failed', error);
    }
  },
};
