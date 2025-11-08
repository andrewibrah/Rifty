/// <reference lib="deno.ns" />
/**
 * Get Operating Picture - Multi-table aggregation for memory operations
 * Returns: features, top goals, hot entries, schedule, cadence profile, risk flags
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface OperatingPictureResult {
  why_model: Record<string, unknown> | null;
  top_goals: any[];
  hot_entries: any[];
  next_72h: any[];
  cadence_profile: {
    cadence: string;
    session_length_minutes: number;
    last_message_at: string | null;
    missed_day_count: number;
    current_streak: number;
    timezone: string;
  };
  risk_flags: string[];
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    console.log("[get_operating_picture] Request received");
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[get_operating_picture] Missing authorization header");
      return jsonResponse(401, { error: "Missing authorization" });
    }

    const accessToken = authHeader.slice(7);
    console.log(
      "[get_operating_picture] Access token present, length:",
      accessToken.length
    );

    const user = await requireUser(accessToken);
    console.log("[get_operating_picture] User authenticated:", user.id);

    const now = new Date();
    const future = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    // Fetch all data in parallel with error handling
    const [
      featuresData,
      goalsData,
      entriesData,
      schedulesData,
      settingsData,
      profileData,
    ] = await Promise.all([
      // Features (why_model, risk_flags, cadence_profile)
      supabaseClient
        .from("features")
        .select("key, value_json")
        .eq("user_id", user.id)
        .in("key", ["why_model", "risk_flags", "cadence_profile"])
        .then((result) => {
          if (result.error) {
            console.warn(
              "[get_operating_picture] Features query error:",
              result.error
            );
            return { data: null, error: result.error };
          }
          return result;
        }),

      // Top goals with priorities - query goals directly since mv might be empty
      supabaseClient
        .from("goals")
        .select(
          "id, title, status, current_step, micro_steps, metadata, updated_at, target_date"
        )
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(3)
        .then((result) => {
          if (result.error) {
            console.warn(
              "[get_operating_picture] Goals query error:",
              result.error
            );
            return { data: [], error: result.error };
          }
          // Transform to match expected format
          const transformed = {
            data:
              result.data?.map((goal) => ({
                goal_id: goal.id,
                priority_score: 50, // Default priority since MV is empty
                goals: goal,
              })) || [],
            error: null,
          };
          return transformed;
        }),

      // Hot entries with summaries - query separately to avoid join issues
      supabaseClient
        .from("entry_summaries")
        .select("entry_id, summary, emotion, urgency_level")
        .eq("user_id", user.id)
        .order("urgency_level", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6)
        .then(async (result) => {
          if (result.error) {
            console.warn(
              "[get_operating_picture] Entries query error:",
              result.error
            );
            return { data: [], error: result.error };
          }

          // Fetch entry details separately
          if (result.data && result.data.length > 0) {
            const entryIds = result.data.map((s) => s.entry_id);
            const { data: entries } = await supabaseClient
              .from("entries")
              .select("id, type, content, metadata, created_at")
              .in("id", entryIds);

            // Merge the data
            const merged = result.data.map((summary) => {
              const entry = entries?.find((e) => e.id === summary.entry_id);
              return {
                ...summary,
                entries: entry || null,
              };
            });

            return { data: merged, error: null };
          }

          return result;
        }),

      // Schedule blocks (next 72h)
      supabaseClient
        .from("schedule_blocks")
        .select(
          "id, intent, summary, start_at, end_at, goal_id, location, attendees, receipts"
        )
        .eq("user_id", user.id)
        .gte("start_at", now.toISOString())
        .lte("start_at", future.toISOString())
        .order("start_at", { ascending: true })
        .limit(6)
        .then((result) => {
          if (result.error) {
            console.warn(
              "[get_operating_picture] Schedule query error:",
              result.error
            );
            return { data: [], error: result.error };
          }
          return result;
        }),

      // User settings
      supabaseClient
        .from("user_settings")
        .select("cadence, session_length_minutes")
        .eq("user_id", user.id)
        .maybeSingle()
        .then((result) => {
          if (result.error) {
            console.warn(
              "[get_operating_picture] Settings query error:",
              result.error
            );
            return { data: null, error: result.error };
          }
          return result;
        }),

      // Profile
      supabaseClient
        .from("profiles")
        .select("timezone, missed_day_count, current_streak, last_message_at")
        .eq("id", user.id)
        .maybeSingle()
        .then((result) => {
          if (result.error) {
            console.warn(
              "[get_operating_picture] Profile query error:",
              result.error
            );
            return { data: null, error: result.error };
          }
          return result;
        }),
    ]);

    console.log("[get_operating_picture] All queries completed");
    console.log(
      "[get_operating_picture] Features data:",
      featuresData.error
        ? `ERROR: ${featuresData.error.message}`
        : `OK (${featuresData.data?.length || 0} rows)`
    );
    console.log(
      "[get_operating_picture] Goals data:",
      goalsData.error
        ? `ERROR: ${goalsData.error.message}`
        : `OK (${goalsData.data?.length || 0} rows)`
    );
    console.log(
      "[get_operating_picture] Entries data:",
      entriesData.error
        ? `ERROR: ${entriesData.error.message}`
        : `OK (${entriesData.data?.length || 0} rows)`
    );
    console.log(
      "[get_operating_picture] Schedule data:",
      schedulesData.error
        ? `ERROR: ${schedulesData.error.message}`
        : `OK (${schedulesData.data?.length || 0} rows)`
    );
    console.log(
      "[get_operating_picture] Settings data:",
      settingsData.error ? `ERROR: ${settingsData.error.message}` : `OK`
    );
    console.log(
      "[get_operating_picture] Profile data:",
      profileData.error ? `ERROR: ${profileData.error.message}` : `OK`
    );

    // Build feature map
    const featureMap: Record<string, unknown> = {};
    if (featuresData.data) {
      for (const row of featuresData.data) {
        if (row.key) {
          featureMap[row.key] = row.value_json ?? {};
        }
      }
    }

    // Extract features
    const whyModel =
      featureMap.why_model && typeof featureMap.why_model === "object"
        ? (featureMap.why_model as Record<string, unknown>)
        : null;

    const cadenceOverride =
      featureMap.cadence_profile &&
      typeof featureMap.cadence_profile === "object"
        ? (featureMap.cadence_profile as Record<string, unknown>)
        : null;

    const riskFlags = Array.isArray(featureMap.risk_flags)
      ? (featureMap.risk_flags as string[]).filter(
          (item) => typeof item === "string"
        )
      : [];

    // Process goals
    const topGoals = (goalsData.data ?? [])
      .map((row: any) => {
        const goal = row.goals;
        if (!goal) return null;
        return {
          id: String(goal.id),
          title: String(goal.title ?? "Untitled goal"),
          status: String(goal.status ?? "active"),
          priority_score: Number(row.priority_score ?? 0),
          target_date: goal.target_date ?? null,
          current_step: goal.current_step ?? null,
          micro_steps: Array.isArray(goal.micro_steps) ? goal.micro_steps : [],
          metadata: goal.metadata ?? {},
          updated_at: goal.updated_at ?? new Date().toISOString(),
        };
      })
      .filter(Boolean);

    // Process entries
    const hotEntries = (entriesData.data ?? [])
      .slice(0, 3)
      .map((row: any) => {
        const entry = row.entries;
        if (!entry) return null;
        const content = typeof entry.content === "string" ? entry.content : "";
        const snippet = content.slice(0, 220);
        return {
          id: String(entry.id),
          type: String(entry.type ?? "journal"),
          summary: typeof row.summary === "string" ? row.summary : snippet,
          created_at: String(entry.created_at ?? new Date().toISOString()),
          emotion: typeof row.emotion === "string" ? row.emotion : null,
          urgency_level:
            typeof row.urgency_level === "number" ? row.urgency_level : null,
          snippet,
          metadata: entry.metadata ?? {},
        };
      })
      .filter(Boolean);

    // Process schedules
    const next72h = (schedulesData.data ?? []).slice(0, 5).map((row: any) => ({
      id: String(row.id),
      intent: row.intent ?? null,
      summary: row.summary ?? null,
      start_at: row.start_at ?? new Date().toISOString(),
      end_at: row.end_at ?? row.start_at ?? new Date().toISOString(),
      goal_id: row.goal_id ?? null,
      location: row.location ?? null,
      attendees: Array.isArray(row.attendees) ? row.attendees : [],
      receipts: row.receipts ?? {},
    }));

    // Build cadence profile
    const cadenceValue =
      cadenceOverride?.cadence ?? settingsData.data?.cadence ?? "none";
    const sessionLength =
      Number(
        settingsData.data?.session_length_minutes ??
          cadenceOverride?.session_length_minutes ??
          25
      ) || 25;
    const profile = profileData.data ?? null;

    const cadenceProfile = {
      cadence: String(cadenceValue),
      session_length_minutes: sessionLength,
      last_message_at: profile?.last_message_at ?? null,
      missed_day_count: Number(profile?.missed_day_count ?? 0),
      current_streak: Number(profile?.current_streak ?? 0),
      timezone:
        profile?.timezone && typeof profile.timezone === "string"
          ? profile.timezone
          : "UTC",
    };

    const result: OperatingPictureResult = {
      why_model: whyModel,
      top_goals: topGoals,
      hot_entries: hotEntries,
      next_72h,
      cadence_profile: cadenceProfile,
      risk_flags: riskFlags,
    };

    return jsonResponse(200, result);
  } catch (error: any) {
    console.error("[get_operating_picture] Error:", error);
    console.error("[get_operating_picture] Error stack:", error?.stack);
    console.error(
      "[get_operating_picture] Error details:",
      JSON.stringify(error, null, 2)
    );
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message || "Unknown error",
      details: error?.details || null,
      hint: error?.hint || null,
      code: error?.code || null,
    });
  }
});
