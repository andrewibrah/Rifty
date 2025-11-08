/// <reference lib="deno.ns" />
/**
 * Test Operating Picture - Diagnostic version that checks each step
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

  const diagnostics: any = {
    step: "",
    error: null,
    details: {},
  };

  try {
    diagnostics.step = "auth";
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      diagnostics.error = "Missing authorization header";
      return jsonResponse(401, diagnostics);
    }

    const accessToken = authHeader.slice(7);
    const user = await requireUser(accessToken);
    diagnostics.details.userId = user.id;
    diagnostics.details.userEmail = user.email;

    // Test each table individually
    diagnostics.step = "features";
    const featuresResult = await supabaseClient
      .from("features")
      .select("key, value_json")
      .eq("user_id", user.id)
      .limit(1);
    diagnostics.details.features = {
      error: featuresResult.error?.message || null,
      count: featuresResult.data?.length || 0,
    };

    diagnostics.step = "mv_goal_priority";
    const goalsResult = await supabaseClient
      .from("mv_goal_priority")
      .select("goal_id, priority_score")
      .eq("user_id", user.id)
      .limit(1);
    diagnostics.details.mv_goal_priority = {
      error: goalsResult.error?.message || null,
      errorCode: goalsResult.error?.code || null,
      errorDetails: goalsResult.error?.details || null,
      count: goalsResult.data?.length || 0,
    };

    diagnostics.step = "entry_summaries";
    const entriesResult = await supabaseClient
      .from("entry_summaries")
      .select("entry_id")
      .eq("user_id", user.id)
      .limit(1);
    diagnostics.details.entry_summaries = {
      error: entriesResult.error?.message || null,
      count: entriesResult.data?.length || 0,
    };

    diagnostics.step = "schedule_blocks";
    const scheduleResult = await supabaseClient
      .from("schedule_blocks")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    diagnostics.details.schedule_blocks = {
      error: scheduleResult.error?.message || null,
      count: scheduleResult.data?.length || 0,
    };

    diagnostics.step = "user_settings";
    const settingsResult = await supabaseClient
      .from("user_settings")
      .select("cadence")
      .eq("user_id", user.id)
      .maybeSingle();
    diagnostics.details.user_settings = {
      error: settingsResult.error?.message || null,
      found: !!settingsResult.data,
    };

    diagnostics.step = "profiles";
    const profileResult = await supabaseClient
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle();
    diagnostics.details.profiles = {
      error: profileResult.error?.message || null,
      found: !!profileResult.data,
    };

    diagnostics.step = "complete";
    diagnostics.error = null;

    return jsonResponse(200, {
      success: true,
      diagnostics,
    });
  } catch (error: any) {
    diagnostics.error = error.message;
    diagnostics.errorStack = error.stack;
    return jsonResponse(500, {
      success: false,
      diagnostics,
    });
  }
});
