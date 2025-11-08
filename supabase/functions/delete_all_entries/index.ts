/// <reference lib="deno.ns" />
/**
 * delete_all_entries edge function
 * Bulk delete all entries for authenticated user with logging
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

interface DeleteAllEntriesResponse {
  deleted_count: number;
  deleted_at: string;
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

    // Get count before deletion for logging
    const { count: beforeCount, error: countError } = await supabaseAdminClient
      .from("entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      console.error("[delete_all_entries] Count error:", countError);
    }

    const entryCount = beforeCount ?? 0;

    // Perform bulk delete
    const { error: deleteError } = await supabaseAdminClient
      .from("entries")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[delete_all_entries] Delete error:", deleteError);
      throw deleteError;
    }

    const timestamp = nowIso();

    // Log the bulk deletion for audit trail
    try {
      await supabaseAdminClient.from("deletion_logs").insert({
        user_id: user.id,
        operation: "delete_all_entries",
        deleted_count: entryCount,
        timestamp,
        metadata: {
          type: "all",
          initiated_by: "user",
        },
      });
    } catch (logError) {
      // Non-critical - log and continue
      console.warn("[delete_all_entries] Failed to log deletion:", logError);
    }

    const response: DeleteAllEntriesResponse = {
      deleted_count: entryCount,
      deleted_at: timestamp,
    };

    return jsonResponse(200, response);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[delete_all_entries] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
