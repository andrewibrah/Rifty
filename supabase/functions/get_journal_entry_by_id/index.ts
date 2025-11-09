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

type EntryType = "journal" | "goal" | "schedule";

interface RemoteJournalEntry {
  id: string;
  user_id: string;
  type: EntryType;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  ai_intent?: string | null;
  ai_confidence?: number | null;
  ai_meta?: Record<string, unknown> | null;
  source?: string | null;
  mood?: string | null;
  feeling_tags?: string[] | null;
  linked_moments?: string[] | null;
}

interface GetJournalEntryRequest {
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

    const body: GetJournalEntryRequest = await req
      .json()
      .catch(() => ({}));

    const entryId =
      typeof body.entry_id === "string" ? body.entry_id.trim() : "";

    if (!isUUID(entryId)) {
      await logAuditEvent({
        userId: user.id,
        type: "get_journal_entry_by_id",
        subjectType: "entry",
        subjectId: null,
        payload: { reason: "invalid_id" },
      });
      return jsonResponse(200, null);
    }

    const { data, error } = await supabaseAdminClient
      .from("entries")
      .select("*")
      .eq("id", entryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(
        "[get_journal_entry_by_id] Query failed",
        error
      );
      return jsonResponse(500, {
        error: "Failed to fetch journal entry",
      });
    }

    const entry = (data as RemoteJournalEntry | null) ?? null;

    await logAuditEvent({
      userId: user.id,
      type: "get_journal_entry_by_id",
      subjectType: "entry",
      subjectId: entryId,
      payload: { found: Boolean(entry) },
    });

    return jsonResponse(200, entry);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error(
      "[get_journal_entry_by_id] Unexpected error",
      error
    );
    return jsonResponse(500, { error: "Internal server error" });
  }
});
