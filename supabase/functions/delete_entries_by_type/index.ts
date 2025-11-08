/// <reference lib="deno.ns" />
/**
 * delete_entries_by_type edge function
 * Bulk delete entries by type for authenticated user with logging
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

type EntryType = "journal" | "goal" | "schedule";

interface DeleteEntriesByTypeRequest {
  type?: string;
}

interface DeleteEntriesByTypeResponse {
  deleted_count: number;
  deleted_at: string;
  type: EntryType;
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

function isValidEntryType(type: string): type is EntryType {
  return type === "journal" || type === "goal" || type === "schedule";
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

    const body: DeleteEntriesByTypeRequest = await req.json().catch(() => ({}));
    const typeParam = typeof body.type === "string" ? body.type.trim() : "";

    if (!typeParam) {
      return jsonResponse(400, { error: "type is required" });
    }

    if (!isValidEntryType(typeParam)) {
      return jsonResponse(400, {
        error: `Invalid type. Must be one of: journal, goal, schedule`,
      });
    }

    const entryType: EntryType = typeParam;

    // Get count before deletion for logging
    const { count: beforeCount, error: countError } = await supabaseAdminClient
      .from("entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", entryType);

    if (countError) {
      console.error("[delete_entries_by_type] Count error:", countError);
    }

    const entryCount = beforeCount ?? 0;

    // Perform bulk delete
    const { error: deleteError } = await supabaseAdminClient
      .from("entries")
      .delete()
      .eq("user_id", user.id)
      .eq("type", entryType);

    if (deleteError) {
      console.error("[delete_entries_by_type] Delete error:", deleteError);
      throw deleteError;
    }

    const timestamp = nowIso();

    // Log the bulk deletion for audit trail
    try {
      await supabaseAdminClient.from("deletion_logs").insert({
        user_id: user.id,
        operation: "delete_entries_by_type",
        deleted_count: entryCount,
        timestamp,
        metadata: {
          type: entryType,
          initiated_by: "user",
        },
      });
    } catch (logError) {
      // Non-critical - log and continue
      console.warn(
        "[delete_entries_by_type] Failed to log deletion:",
        logError
      );
    }

    const response: DeleteEntriesByTypeResponse = {
      deleted_count: entryCount,
      deleted_at: timestamp,
      type: entryType,
    };

    return jsonResponse(200, response);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[delete_entries_by_type] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
