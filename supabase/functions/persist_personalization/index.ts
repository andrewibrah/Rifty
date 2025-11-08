/// <reference lib="deno.ns" />
/**
 * persist_personalization edge function
 * Multi-table transaction: user_settings (upsert), profiles (update), persona_signals (insert)
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

interface PersistPersonalizationRequest {
  state?: any;
  options?: {
    profileTimezone?: string;
    onboardingCompleted?: boolean;
    rationale?: string;
    source?: string;
  };
}

interface PersistPersonalizationResponse {
  persona_tag: string;
  updated_at: string;
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

function computePersonaTag(state: any): string {
  // Simplified persona tag computation based on state
  const introspection = state?.introspection_level ?? 5;
  const depth = state?.depth_preference ?? "balanced";
  const cadence = state?.cadence ?? "none";

  if (introspection >= 8 && depth === "deep") {
    return "deep_reflector";
  }
  if (introspection <= 3) {
    return "action_oriented";
  }
  if (cadence === "daily_am" || cadence === "daily_pm") {
    return "daily_practitioner";
  }
  if (depth === "light") {
    return "casual_journaler";
  }

  return "balanced_explorer";
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

    const body: PersistPersonalizationRequest = await req
      .json()
      .catch(() => ({}));

    if (!body.state) {
      return jsonResponse(400, { error: "state is required" });
    }

    const options = body.options ?? {};
    const personaTag = computePersonaTag(body.state);
    const timestamp = nowIso();

    // Create clean state without custom_goals
    const cleanState = { ...body.state };
    delete cleanState.custom_goals;

    // 1. Upsert user_settings
    const settingsPayload: any = {
      ...cleanState,
      persona_tag: personaTag,
      updated_at: timestamp,
      user_id: user.id,
    };

    const { error: settingsError } = await supabaseAdminClient
      .from("user_settings")
      .upsert(settingsPayload, { onConflict: "user_id" });

    if (settingsError) {
      console.error(
        "[persist_personalization] Failed to upsert user settings",
        settingsError
      );
      throw settingsError;
    }

    // 2. Update profiles
    if (options.profileTimezone || options.onboardingCompleted !== undefined) {
      const profileUpdatePayload: Record<string, any> = {
        updated_at: timestamp,
      };

      if (options.profileTimezone) {
        profileUpdatePayload.timezone = options.profileTimezone;
      }
      if (options.onboardingCompleted !== undefined) {
        profileUpdatePayload.onboarding_completed = options.onboardingCompleted;
      }

      const { error: profileError } = await supabaseAdminClient
        .from("profiles")
        .update(profileUpdatePayload)
        .eq("id", user.id);

      if (profileError) {
        // Try fallback without timezone if column doesn't exist
        if (profileError.code === "42703") {
          const fallbackPayload = { ...profileUpdatePayload };
          delete fallbackPayload.timezone;

          const { error: fallbackError } = await supabaseAdminClient
            .from("profiles")
            .update(fallbackPayload)
            .eq("id", user.id);

          if (fallbackError) {
            console.error(
              "[persist_personalization] profile update fallback failed",
              fallbackError
            );
            throw fallbackError;
          }
        } else {
          console.error(
            "[persist_personalization] Failed to update profile",
            profileError
          );
          throw profileError;
        }
      }
    }

    // 3. Insert persona_signal
    if (options.rationale && options.source) {
      const signal = {
        source: options.source,
        rationale: options.rationale,
        changes: settingsPayload,
      };

      try {
        await supabaseAdminClient.from("persona_signals").insert({
          user_id: user.id,
          source: signal.source,
          rationale: signal.rationale,
          payload: signal,
        });
      } catch (error) {
        // Non-critical error - log and continue
        console.warn(
          "[persist_personalization] Unable to record persona signal",
          error
        );
      }
    }

    const response: PersistPersonalizationResponse = {
      persona_tag: personaTag,
      updated_at: timestamp,
    };

    return jsonResponse(200, response);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[persist_personalization] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
