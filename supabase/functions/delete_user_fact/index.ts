/// <reference lib="deno.ns" />
/**
 * delete_user_fact edge function
 * Deletes a user fact with audit logging
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

interface DeleteUserFactRequest {
  fact_id?: string;
}

interface DeleteUserFactResponse {
  deleted_id: string;
  deleted_at: string;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
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

    const body: DeleteUserFactRequest = await req.json().catch(() => ({}));
    const factId =
      typeof body.fact_id === "string" && body.fact_id.length > 0
        ? body.fact_id
        : "";

    if (!factId) {
      return jsonResponse(400, { error: "fact_id is required" });
    }

    if (!isValidUUID(factId)) {
      return jsonResponse(400, { error: "Invalid fact_id format" });
    }

    // Verify fact exists and belongs to user (and get fact text for logging)
    const { data: existingFact, error: fetchError } = await supabaseAdminClient
      .from("user_facts")
      .select("id, user_id, fact")
      .eq("id", factId)
      .single();

    if (fetchError || !existingFact || existingFact.user_id !== user.id) {
      return jsonResponse(404, { error: "User fact not found" });
    }

    // Delete user fact
    const { error: deleteError } = await supabaseAdminClient
      .from("user_facts")
      .delete()
      .eq("id", factId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[delete_user_fact] Delete error:", deleteError);
      return jsonResponse(500, { error: "Failed to delete user fact" });
    }

    const timestamp = nowIso();

    // Log the deletion for audit trail
    try {
      await supabaseAdminClient.from("deletion_logs").insert({
        user_id: user.id,
        operation: "delete_user_fact",
        deleted_count: 1,
        timestamp,
        metadata: {
          fact_id: factId,
          fact_text: existingFact.fact,
          initiated_by: "user",
        },
      });
    } catch (logError) {
      // Non-critical - log and continue
      console.warn("[delete_user_fact] Failed to log deletion:", logError);
    }

    const response: DeleteUserFactResponse = {
      deleted_id: factId,
      deleted_at: timestamp,
    };

    return jsonResponse(200, response);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[delete_user_fact] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
