/// <reference lib="deno.ns" />
/**
 * Check Schema - Diagnostic function to check which tables exist
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing authorization" });
    }

    const tables = [
      "features",
      "mv_goal_priority",
      "entry_summaries",
      "schedule_blocks",
      "user_settings",
      "profiles",
      "goals",
      "entries",
    ];

    const results: Record<string, any> = {};

    for (const table of tables) {
      try {
        const { data, error, count } = await supabaseClient
          .from(table)
          .select("*", { count: "exact", head: true })
          .limit(0);

        results[table] = {
          exists: !error,
          error: error ? error.message : null,
          count: count,
        };
      } catch (e: any) {
        results[table] = {
          exists: false,
          error: e.message,
          count: null,
        };
      }
    }

    return jsonResponse(200, {
      message: "Schema check complete",
      tables: results,
    });
  } catch (error: any) {
    console.error("[check_schema] Error:", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message || "Unknown error",
    });
  }
});
