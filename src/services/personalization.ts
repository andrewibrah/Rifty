import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import {
  type PersonalizationBundle,
  type PersonalizationMode,
  type PersonalizationState,
  type PersonaSignalPayload,
  type ProfileSnapshot,
  type ReflectionCadence,
  type UserSettings,
  type CachedPersonalization,
  type PersonaTag,
} from "../types/personalization";
import { computePersonaTag } from "../utils/persona";

const CACHE_KEY = "@reflectify:user_settings";

const parseIsoDate = (value?: string | null) =>
  value ? new Date(value).getTime() : 0;

const nowIso = () => new Date().toISOString();

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

const fetchProfile = async (): Promise<ProfileSnapshot | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Failed to load profile", error);
    return null;
  }

  if (data) {
    const rawProfile = data as Record<string, any>;
    const fallbackTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    const profile: ProfileSnapshot = {
      id: (rawProfile.id as string) ?? user.id,
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
    return profile;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const newProfile: ProfileSnapshot = {
    id: user.id,
    timezone,
    onboarding_completed: false,
    updated_at: nowIso(),
    missed_day_count: 0,
    current_streak: 0,
    last_message_at: null,
  };

  const insertPayload: Record<string, any> = {
    id: user.id,
    email: user.email,
    timezone,
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
          "Failed to initialize profile without timezone column",
          fallbackError
        );
      }
    } else {
      console.error("Failed to initialize profile", insertError);
    }
  }
  return newProfile;
};

const fetchSettings = async (): Promise<UserSettings | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Failed to load personalization settings", error);
    return null;
  }
  if (!data) return null;
  return data as UserSettings;
};

export const fetchPersonalizationBundle =
  async (): Promise<PersonalizationBundle | null> => {
    const profile = await fetchProfile();
    if (!profile) return null;
    const cachedSettings = await loadCachedSettings();
    const remoteSettings = await fetchSettings();

    let merged = remoteSettings ?? cachedSettings ?? null;

    if (remoteSettings && cachedSettings) {
      const remoteUpdated = parseIsoDate(remoteSettings.updated_at);
      const localUpdated = parseIsoDate(cachedSettings.updated_at);
      merged = remoteUpdated >= localUpdated ? remoteSettings : cachedSettings;
    }

    if (merged) {
      const enriched: UserSettings = {
        ...merged,
        updated_at: merged.updated_at ?? nowIso(),
      };
      await storeCachedSettings(enriched);
      return { profile, settings: enriched };
    }

    return { profile, settings: null };
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
