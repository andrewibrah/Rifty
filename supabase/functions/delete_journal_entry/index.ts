/// <reference lib="deno.ns" />
import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import {
  AuthError,
  enforceRoles,
  requireAuthContext,
} from "../_shared/auth.ts";
import { logAuditEvent } from "../_shared/audit.ts";
import { isUUID } from "../_shared/validation.ts";

interface DeleteJournalEntryRequest {
  entry_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { user, role } = await requireAuthContext(req);
    enforceRoles(role, ["user", "admin"]);

    const body: DeleteJournalEntryRequest = await req
      .json()
      .catch(() => ({}));

    const entryId =
      typeof body.entry_id === "string" ? body.entry_id.trim() : "";

    if (!isUUID(entryId)) {
      return jsonResponse(400, {
        error: "entry_id must be a valid UUID",
      });
    }

    const { data: entry, error: fetchError } = await supabaseAdminClient
      .from("entries")
      .select("id, user_id, type")
      .eq("id", entryId)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "[delete_journal_entry] Failed to load entry",
        fetchError
      );
      return jsonResponse(500, {
        error: "Failed to verify entry ownership",
      });
    }

    if (!entry) {
      return jsonResponse(404, { error: "Entry not found" });
    }

    if (entry.user_id !== user.id) {
      return jsonResponse(403, { error: "Forbidden" });
    }

    const { error: deleteError } = await supabaseAdminClient
      .from("entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error(
        "[delete_journal_entry] Delete failed",
        deleteError
      );
      return jsonResponse(500, {
        error: "Failed to delete journal entry",
      });
    }

    await logAuditEvent({
      userId: user.id,
      type: "delete_journal_entry",
      subjectType: "entry",
      subjectId: entryId,
      payload: { entry_type: entry.type },
    });

    return jsonResponse(200, { deleted: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error("[delete_journal_entry] Unexpected error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
