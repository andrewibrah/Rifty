import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { debugIfTableMissing } from "../utils/supabaseErrors";
import {
  type CachedPersonalization,
  type PersonalizationBundle,
  type PersonalizationMode,
  type PersonalizationRuntime,
  type PersonalizationState,
  type PersonaSignalPayload,
  type PersonaTag,
  type PrivacyGateMap,
  type ProfileSnapshot,
  type ReflectionCadence,
  type UserSettings,
} from "../types/personalization";
import { computePersonaTag } from "../utils/persona";

const CACHE_KEY = "@reflectify:user_settings";
const PRIVACY_GATES_FEATURE_KEY = "privacy_gates";
const CRISIS_RULES_FEATURE_KEY = "crisis_rules";

const DEFAULT_PRIVACY_GATES: PrivacyGateMap = {};
const DEFAULT_CRISIS_RULES: Record<string, unknown> = {};

const parseIsoDate = (value?: string | null) =>
  value ? new Date(value).getTime() : 0;

const nowIso = () => new Date().toISOString();

const clonePrivacyMap = (map: PrivacyGateMap): PrivacyGateMap =>
  Object.assign({}, map);

const normalizePrivacyGates = (value: unknown): PrivacyGateMap => {
  if (!value) {
    return clonePrivacyMap(DEFAULT_PRIVACY_GATES);
  }

  const gates: PrivacyGateMap = {};

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) {
        gates[item.trim()] = true;
        continue;
      }
      if (item && typeof item === "object") {
        const raw = item as Record<string, unknown>;
        const key =
          typeof raw.key === "string"
            ? raw.key
            : typeof raw.id === "string"
            ? raw.id
            : null;
        if (!key) continue;
        const allowed =
          typeof raw.allowed === "boolean"
            ? raw.allowed
            : typeof raw.value === "boolean"
            ? raw.value
            : true;
        gates[key] = allowed;
      }
    }
    return Object.keys(gates).length > 0
      ? gates
      : clonePrivacyMap(DEFAULT_PRIVACY_GATES);
  }

  if (typeof value === "object") {
    for (const [key, raw] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (!key) continue;
      let allowed = true;
      if (typeof raw === "boolean") {
        allowed = raw;
      } else if (raw && typeof raw === "object") {
        const nested = raw as Record<string, unknown>;
        if (typeof nested.allowed === "boolean") {
          allowed = nested.allowed;
        } else if (typeof nested.denied === "boolean") {
          allowed = !nested.denied;
        }
      }
      gates[key] = allowed;
    }
    return Object.keys(gates).length > 0
      ? gates
      : clonePrivacyMap(DEFAULT_PRIVACY_GATES);
  }

  return clonePrivacyMap(DEFAULT_PRIVACY_GATES);
};

const normalizeCrisisRules = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CRISIS_RULES };
  }
  return { ...(value as Record<string, unknown>) };
};

const buildRuntimePreferences = (
  settings: UserSettings | null,
  featureMap: Record<string, unknown>
): PersonalizationRuntime => {
  const privacyRaw = featureMap[PRIVACY_GATES_FEATURE_KEY];
  const crisisRaw = featureMap[CRISIS_RULES_FEATURE_KEY];

  return {
    user_settings: settings,
    persona: settings?.persona_tag ?? null,
    cadence: settings?.cadence ?? "none",
    tone: settings?.language_intensity ?? "neutral",
    spiritual_on: Boolean(settings?.spiritual_prompts),
    bluntness: settings?.bluntness ?? 5,
    privacy_gates: normalizePrivacyGates(privacyRaw),
    crisis_rules: normalizeCrisisRules(crisisRaw),
    resolved_at: nowIso(),
  };
};

const buildFallbackProfile = (userId: string): ProfileSnapshot => {
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() ?? "UTC";
  return {
    id: userId,
    timezone,
    onboarding_completed: false,
    updated_at: nowIso(),
    missed_day_count: 0,
    current_streak: 0,
    last_message_at: null,
  };
};

const fetchFeatureMap = async (
  userId: string
): Promise<Record<string, unknown>> => {
  try {
    const { data, error } = await supabase
      .from("features")
      .select("key, value_json")
      .eq("user_id", userId);

    if (error) {
      if (debugIfTableMissing("[personalization] feature fetch", error)) {
        return {};
      }
      console.warn("[personalization] feature fetch failed", error);
      return {};
    }

    const map: Record<string, unknown> = {};
    for (const row of data ?? []) {
      if (row && typeof row.key === "string") {
        map[row.key] = row.value_json ?? {};
      }
    }
    return map;
  } catch (error) {
    console.warn("[personalization] feature fetch threw", error);
    return {};
  }
};

export const loadCachedSettings = async (): Promise<UserSettings | null> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedPersonalization = JSON.parse(raw);
    return cached.settings;
  } catch (error) {
    console.warn("Failed to load cached personalization settings", error);
    return null;
  }
};

export const storeCachedSettings = async (settings: UserSettings) => {
  try {
    if (!settings.local_cache_enabled) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return;
    }
    const payload: CachedPersonalization = {
      settings,
      updated_at: settings.updated_at ?? nowIso(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to cache personalization settings", error);
  }
};

const fetchProfile = async (
  userId: string,
  authUser: User | null
): Promise<ProfileSnapshot> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[personalization] profile query failed", error);
  }

  if (data) {
    const rawProfile = data as Record<string, unknown>;
    const fallbackTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() ?? "UTC";
    return {
      id: (rawProfile.id as string) ?? userId,
      timezone:
        typeof rawProfile.timezone === "string" &&
        rawProfile.timezone.length > 0
          ? rawProfile.timezone
          : fallbackTimezone,
      onboarding_completed: Boolean(rawProfile.onboarding_completed),
      updated_at: (rawProfile.updated_at as string | null) ?? nowIso(),
      missed_day_count: Number(rawProfile.missed_day_count ?? 0),
      current_streak: Number(rawProfile.current_streak ?? 0),
      last_message_at: (rawProfile.last_message_at as string | null) ?? null,
    };
  }

  const fallback = buildFallbackProfile(userId);

  if (!authUser) {
    return fallback;
  }

  const insertPayload: Record<string, unknown> = {
    id: userId,
    email: authUser.email,
    timezone: fallback.timezone,
    onboarding_completed: false,
    missed_day_count: 0,
    current_streak: 0,
    last_message_at: null,
  };

  const { error: insertError } = await supabase
    .from("profiles")
    .upsert(insertPayload, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

  if (insertError) {
    if (insertError.code === "42703") {
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.timezone;
      const { error: fallbackError } = await supabase
        .from("profiles")
        .upsert(fallbackPayload, {
          onConflict: "id",
          ignoreDuplicates: false,
        });
      if (fallbackError) {
        console.error(
          "[personalization] profile init fallback failed",
          fallbackError
        );
      }
    } else {
      console.error("[personalization] profile init failed", insertError);
    }
  }

  return fallback;
};

const fetchSettings = async (userId: string): Promise<UserSettings | null> => {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Failed to load personalization settings", error);
    return null;
  }
  if (!data) return null;
  return data as UserSettings;
};

export const fetchPersonalizationBundle = async (
  uid?: string
): Promise<PersonalizationBundle | null> => {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.warn("[personalization] auth.getUser failed", authError);
  }

  const userId = uid ?? user?.id ?? null;
  if (!userId) {
    return null;
  }

  const [profile, cachedSettings, remoteSettings, featureMap] =
    await Promise.all([
      fetchProfile(userId, user ?? null),
      loadCachedSettings(),
      fetchSettings(userId),
      fetchFeatureMap(userId),
    ]);

  const normalizedRemote = remoteSettings
    ? { ...remoteSettings, updated_at: remoteSettings.updated_at ?? nowIso() }
    : null;
  const normalizedCached = cachedSettings
    ? { ...cachedSettings, updated_at: cachedSettings.updated_at ?? nowIso() }
    : null;

  let resolvedSettings: UserSettings | null = null;

  if (normalizedRemote && normalizedCached) {
    const remoteUpdated = parseIsoDate(normalizedRemote.updated_at);
    const cachedUpdated = parseIsoDate(normalizedCached.updated_at);
    resolvedSettings =
      remoteUpdated >= cachedUpdated ? normalizedRemote : normalizedCached;
    if (remoteUpdated >= cachedUpdated) {
      await storeCachedSettings(normalizedRemote);
    }
  } else if (normalizedRemote) {
    resolvedSettings = normalizedRemote;
    await storeCachedSettings(normalizedRemote);
  } else if (normalizedCached) {
    resolvedSettings = normalizedCached;
  }

  const runtime = buildRuntimePreferences(resolvedSettings, featureMap);

  return {
    ...runtime,
    profile,
    settings: resolvedSettings,
  };
};

interface PersistOptions {
  profileTimezone: string;
  onboardingCompleted: boolean;
  rationale: string;
  source: PersonaSignalPayload["source"];
}

export const persistPersonalization = async (
  state: PersonalizationState,
  options: PersistOptions
): Promise<PersonaTag> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("User not authenticated");
  }

  const personaTag = computePersonaTag(state);

  // Create a clean state object without custom_goals
  const cleanState = { ...state };
  delete (cleanState as any).custom_goals;

  const payload: UserSettings = {
    ...cleanState,
    persona_tag: personaTag,
    updated_at: nowIso(),
    user_id: user.id,
  };

  const { error: settingsError } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "user_id" });
  if (settingsError) {
    console.error("Failed to upsert user settings", settingsError);
    throw settingsError;
  }

  const profileUpdatePayload: Record<string, any> = {
    timezone: options.profileTimezone,
    onboarding_completed: options.onboardingCompleted,
    updated_at: nowIso(),
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .update(profileUpdatePayload)
    .eq("id", user.id);

  if (profileError) {
    if (profileError.code === "42703") {
      const fallbackPayload = { ...profileUpdatePayload };
      delete fallbackPayload.timezone;
      const { error: fallbackError } = await supabase
        .from("profiles")
        .update(fallbackPayload)
        .eq("id", user.id);
      if (fallbackError) {
        console.error(
          "Failed to update profile without timezone column",
          fallbackError
        );
        throw fallbackError;
      }
    } else {
      console.error("Failed to update profile", profileError);
      throw profileError;
    }
  }

  await storeCachedSettings(payload);

  const signal: PersonaSignalPayload = {
    source: options.source,
    rationale: options.rationale,
    changes: payload,
  };

  try {
    await supabase.from("persona_signals").insert({
      user_id: user.id,
      source: signal.source,
      rationale: signal.rationale,
      payload: signal,
    });
  } catch (error) {
    console.warn("Unable to record persona signal, caching for later", error);
    try {
      const raw = await AsyncStorage.getItem("@reflectify:persona_queue");
      const queue = raw ? JSON.parse(raw) : [];
      queue.push({
        rationale: signal.rationale,
        payload: signal,
        created_at: nowIso(),
      });
      await AsyncStorage.setItem(
        "@reflectify:persona_queue",
        JSON.stringify(queue)
      );
    } catch (storageError) {
      console.error("Failed to cache persona signal", storageError);
    }
  }

  return personaTag;
};

export const updateNotificationPreferences = async (prefs: {
  checkin_notifications?: boolean;
  missed_day_notifications?: boolean;
}): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("User not authenticated");
  }

  const payload: Record<string, any> = {};
  if (prefs.checkin_notifications !== undefined) {
    payload.checkin_notifications = prefs.checkin_notifications;
  }
  if (prefs.missed_day_notifications !== undefined) {
    payload.missed_day_notifications = prefs.missed_day_notifications;
  }
  if (Object.keys(payload).length === 0) {
    return;
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert({
      user_id: user.id,
      ...payload,
      updated_at: nowIso(),
    }, { onConflict: "user_id" });

  if (error) {
    throw error;
  }

  const cached = await loadCachedSettings();
  if (cached) {
    const updated = {
      ...cached,
      ...payload,
      updated_at: nowIso(),
    };
    await storeCachedSettings(updated);
  }
};

export const exportPersonalization = async (): Promise<string> => {
  const data = await fetchPersonalizationBundle();
  return JSON.stringify(data, null, 2);
};

export const resetPersonalization = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_settings").delete().eq("user_id", user.id);
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error("Failed to reset personalization data", error);
  }
};

export const deletePersonalization = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("persona_signals").delete().eq("user_id", user.id);
    await supabase.from("user_settings").delete().eq("user_id", user.id);
    await supabase
      .from("profiles")
      .update({ onboarding_completed: false })
      .eq("id", user.id);
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error("Failed to delete personalization data", error);
  }
};
