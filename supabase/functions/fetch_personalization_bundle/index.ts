/// <reference lib="deno.ns" />
/**
 * fetch_personalization_bundle edge function
 * Multi-table aggregation: profile, settings, and features
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

const PRIVACY_GATES_FEATURE_KEY = "privacy_gates";
const CRISIS_RULES_FEATURE_KEY = "crisis_rules";

const DEFAULT_PRIVACY_GATES = {};
const DEFAULT_CRISIS_RULES = {};

interface PersonalizationBundle {
  profile: any;
  settings: any;
  user_settings: any;
  persona: string | null;
  cadence: string;
  tone: string;
  spiritual_on: boolean;
  bluntness: number;
  privacy_gates: any;
  crisis_rules: any;
  resolved_at: string;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePrivacyGates(value: unknown): any {
  if (!value) {
    return { ...DEFAULT_PRIVACY_GATES };
  }

  const gates: Record<string, boolean> = {};

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
    return Object.keys(gates).length > 0 ? gates : { ...DEFAULT_PRIVACY_GATES };
  }

  if (typeof value === "object") {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
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
    return Object.keys(gates).length > 0 ? gates : { ...DEFAULT_PRIVACY_GATES };
  }

  return { ...DEFAULT_PRIVACY_GATES };
}

function normalizeCrisisRules(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CRISIS_RULES };
  }
  return { ...(value as Record<string, unknown>) };
}

async function fetchFeatureMap(
  userId: string
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await supabaseAdminClient
      .from("features")
      .select("key, value_json")
      .eq("user_id", userId);

    if (error) {
      console.warn(
        "[fetch_personalization_bundle] feature fetch failed",
        error
      );
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
    console.warn("[fetch_personalization_bundle] feature fetch threw", error);
    return {};
  }
}

async function fetchProfile(userId: string): Promise<any> {
  const { data, error } = await supabaseAdminClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[fetch_personalization_bundle] profile query failed", error);
  }

  if (data) {
    const rawProfile = data as Record<string, unknown>;
    const fallbackTimezone = "UTC";
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

  // Return fallback profile
  return {
    id: userId,
    timezone: "UTC",
    onboarding_completed: false,
    updated_at: nowIso(),
    missed_day_count: 0,
    current_streak: 0,
    last_message_at: null,
  };
}

async function fetchSettings(userId: string): Promise<any | null> {
  const { data, error } = await supabaseAdminClient
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(
      "[fetch_personalization_bundle] settings fetch failed",
      error
    );
    return null;
  }

  return data ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing or invalid authorization" });
    }

    const accessToken = authHeader.slice(7).trim();
    let user;
    try {
      user = await requireUser(accessToken);
    } catch {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const userId = user.id;

    // Fetch all data in parallel
    const [profile, settings, featureMap] = await Promise.all([
      fetchProfile(userId),
      fetchSettings(userId),
      fetchFeatureMap(userId),
    ]);

    // Build runtime preferences
    const privacyRaw = featureMap[PRIVACY_GATES_FEATURE_KEY];
    const crisisRaw = featureMap[CRISIS_RULES_FEATURE_KEY];

    const bundle: PersonalizationBundle = {
      profile,
      settings,
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

    return jsonResponse(200, bundle);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[fetch_personalization_bundle] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
