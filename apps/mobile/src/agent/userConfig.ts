import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPersonalizationBundle } from '@/services/personalization';
import type {
  LanguageIntensity,
  PersonalizationRuntime,
  PersonaTag,
  PrivacyGateMap,
  ReflectionCadence,
  UserSettings,
} from '@/types/personalization';

const STORAGE_KEY = 'riflett_user_config_v1';
const STORAGE_VERSION = 1;

const CADENCE_VALUES: ReflectionCadence[] = ['none', 'daily', 'weekly'];
const TONE_VALUES: LanguageIntensity[] = ['soft', 'neutral', 'direct'];

interface StoredConfig {
  version: number;
  data: PersonalizationRuntime;
}

type RuntimeConfig = PersonalizationRuntime;

type Listener = (config: RuntimeConfig) => void;

let inMemoryCache: RuntimeConfig | null = null;
const listeners = new Set<Listener>();

const nowIso = () => new Date().toISOString();

const defaultRuntime = (): RuntimeConfig => ({
  user_settings: null,
  persona: null,
  cadence: 'none',
  tone: 'neutral',
  spiritual_on: false,
  bluntness: 5,
  privacy_gates: {},
  crisis_rules: {},
  resolved_at: nowIso(),
});

const isReflectionCadence = (value: unknown): value is ReflectionCadence =>
  typeof value === 'string' && CADENCE_VALUES.includes(value as ReflectionCadence);

const isLanguageIntensity = (value: unknown): value is LanguageIntensity =>
  typeof value === 'string' && TONE_VALUES.includes(value as LanguageIntensity);

const cloneConfig = (config: RuntimeConfig): RuntimeConfig => ({
  ...config,
  user_settings: config.user_settings ? { ...config.user_settings } : null,
  privacy_gates: { ...(config.privacy_gates as PrivacyGateMap) },
  crisis_rules: { ...config.crisis_rules },
});

const persistConfig = async (config: RuntimeConfig) => {
  const payload: StoredConfig = {
    version: STORAGE_VERSION,
    data: config,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const notifyListeners = (config: RuntimeConfig) => {
  if (listeners.size === 0) return;
  const snapshot = cloneConfig(config);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('[user-config] listener error', error);
    }
  }
};

const normalizeRuntime = (candidate: unknown): RuntimeConfig => {
  if (!candidate || typeof candidate !== 'object') {
    return defaultRuntime();
  }

  const raw = candidate as Record<string, unknown>;
  const fallback = defaultRuntime();

  const userSettings =
    raw.user_settings && typeof raw.user_settings === 'object'
      ? (raw.user_settings as UserSettings)
      : null;

  const cadence = isReflectionCadence(raw.cadence)
    ? raw.cadence
    : fallback.cadence;

  const tone = isLanguageIntensity(raw.tone)
    ? (raw.tone as LanguageIntensity)
    : fallback.tone;

  const privacyGates =
    raw.privacy_gates && typeof raw.privacy_gates === 'object'
      ? { ...(raw.privacy_gates as PrivacyGateMap) }
      : {};

  const crisisRules =
    raw.crisis_rules && typeof raw.crisis_rules === 'object'
      ? { ...(raw.crisis_rules as Record<string, unknown>) }
      : {};

  return {
    user_settings: userSettings,
    persona: typeof raw.persona === 'string' ? (raw.persona as PersonaTag) : null,
    cadence,
    tone,
    spiritual_on:
      typeof raw.spiritual_on === 'boolean'
        ? (raw.spiritual_on as boolean)
        : typeof raw.spiritualOn === 'boolean'
        ? (raw.spiritualOn as boolean)
        : fallback.spiritual_on,
    bluntness:
      typeof raw.bluntness === 'number'
        ? (raw.bluntness as number)
        : fallback.bluntness,
    privacy_gates: privacyGates,
    crisis_rules: crisisRules,
    resolved_at:
      typeof raw.resolved_at === 'string' ? (raw.resolved_at as string) : nowIso(),
  };
};

const readFromStorage = async (): Promise<RuntimeConfig> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultRuntime();
    }
    const parsed = JSON.parse(raw) as StoredConfig | RuntimeConfig;
    if (parsed && typeof (parsed as StoredConfig).version === 'number') {
      return normalizeRuntime((parsed as StoredConfig).data);
    }
    return normalizeRuntime(parsed);
  } catch (error) {
    console.warn('[user-config] read failed', error);
    return defaultRuntime();
  }
};

const mergeConfigs = (
  current: RuntimeConfig,
  patch: Partial<RuntimeConfig>
): RuntimeConfig => {
  const merged: RuntimeConfig = {
    ...current,
    ...patch,
    user_settings: (patch.user_settings ?? current.user_settings) || null,
    privacy_gates: patch.privacy_gates
      ? { ...current.privacy_gates, ...patch.privacy_gates }
      : { ...current.privacy_gates },
    crisis_rules: patch.crisis_rules
      ? { ...current.crisis_rules, ...patch.crisis_rules }
      : { ...current.crisis_rules },
    resolved_at: patch.resolved_at ?? nowIso(),
  };
  return normalizeRuntime(merged);
};

export const UserConfig = {
  async snapshot(): Promise<RuntimeConfig> {
    if (inMemoryCache) {
      return cloneConfig(inMemoryCache);
    }
    const fromStorage = await readFromStorage();
    inMemoryCache = normalizeRuntime(fromStorage);
    return cloneConfig(inMemoryCache);
  },

  async update(patch: Partial<RuntimeConfig>): Promise<void> {
    const current = await this.snapshot();
    const next = mergeConfigs(current, patch);
    inMemoryCache = next;
    try {
      await persistConfig(next);
    } catch (error) {
      console.warn('[user-config] update persist failed', error);
    }
    notifyListeners(next);
  },

  async loadUserConfig(userId?: string): Promise<RuntimeConfig> {
    try {
      const bundle = await fetchPersonalizationBundle(userId);
      if (!bundle) {
        const fallback = await this.snapshot();
        return fallback;
      }
      const runtime = normalizeRuntime(bundle);
      inMemoryCache = runtime;
      try {
        await persistConfig(runtime);
      } catch (error) {
        console.warn('[user-config] persist remote failed', error);
      }
      notifyListeners(runtime);
      return cloneConfig(runtime);
    } catch (error) {
      console.warn('[user-config] load remote failed', error);
      return this.snapshot();
    }
  },

  subscribe(onChange: Listener): () => void {
    listeners.add(onChange);
    if (inMemoryCache) {
      try {
        onChange(cloneConfig(inMemoryCache));
      } catch (error) {
        console.warn('[user-config] initial subscriber notify failed', error);
      }
    }
    return () => {
      listeners.delete(onChange);
    };
  },
};

export type UserConfigListener = Listener;

export const subscribeUserConfig = (onChange: UserConfigListener): (() => void) =>
  UserConfig.subscribe(onChange);
