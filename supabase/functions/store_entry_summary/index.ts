/// <reference lib="deno.ns" />
/**
 * store_entry_summary edge function
 * Persists an entry summary for the authenticated user.
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

interface StoreEntrySummaryRequest {
  entry_id?: string;
  summary?: string;
  emotion?: string;
  topics?: string[];
  people?: string[];
  urgency_level?: number;
  suggested_action?: string;
  blockers?: string;
  dates_mentioned?: string[];
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

function sanitizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : [];
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

    const body: StoreEntrySummaryRequest = await req.json().catch(() => ({}));
    const entryId =
      typeof body.entry_id === "string" && body.entry_id.length > 0
        ? body.entry_id
        : "";
    const summary =
      typeof body.summary === "string" && body.summary.trim().length > 0
        ? body.summary.trim()
        : "";

    if (!entryId) {
      return jsonResponse(400, { error: "entry_id is required" });
    }

    if (!summary) {
      return jsonResponse(400, { error: "summary is required" });
    }

    const { data: entryRecord, error: entryError } = await supabaseAdminClient
      .from("entries")
      .select("id, user_id")
      .eq("id", entryId)
      .single();

    if (entryError || !entryRecord || entryRecord.user_id !== user.id) {
      return jsonResponse(404, { error: "Entry not found" });
    }

    const topics = sanitizeStringArray(body.topics);
    const people = sanitizeStringArray(body.people);
    const datesMentioned = sanitizeStringArray(body.dates_mentioned);

    const payload = {
      entry_id: entryId,
      user_id: user.id,
      summary,
      emotion: typeof body.emotion === "string" ? body.emotion : null,
      topics: topics ?? [],
      people: people ?? [],
      urgency_level:
        typeof body.urgency_level === "number" ? body.urgency_level : null,
      suggested_action:
        typeof body.suggested_action === "string"
          ? body.suggested_action
          : null,
      blockers: typeof body.blockers === "string" ? body.blockers : null,
      dates_mentioned: datesMentioned,
    };

    const { data, error } = await supabaseAdminClient
      .from("entry_summaries")
      .upsert(payload, { onConflict: "entry_id" })
      .select()
      .single();

    if (error) {
      console.error("[store_entry_summary] Upsert error:", error);
      return jsonResponse(500, { error: "Failed to store summary" });
    }

    return jsonResponse(200, data ?? {});
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[store_entry_summary] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
