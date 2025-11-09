/// <reference lib="deno.ns" />
import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import {
  AuthError,
  enforceRoles,
  requireAuthContext,
} from "../_shared/auth.ts";
import { logAuditEvent } from "../_shared/audit.ts";
import {
  isUUID,
  normalizeStringArray,
  normalizeUUIDArray,
  sanitizeMetadata,
} from "../_shared/validation.ts";

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

interface UpdateJournalEntryRequest {
  entry_id?: string;
  content?: string;
  metadata?: Record<string, unknown> | null;
  mood?: string | null;
  feeling_tags?: unknown;
  linked_moments?: unknown;
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

    const body: UpdateJournalEntryRequest = await req
      .json()
      .catch(() => ({}));

    const entryId =
      typeof body.entry_id === "string" ? body.entry_id.trim() : "";

    if (!isUUID(entryId)) {
      return jsonResponse(400, {
        error: "entry_id must be a valid UUID",
      });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.content === "string") {
      updates.content = body.content;
    }

    if (body.metadata !== undefined) {
      updates.metadata = sanitizeMetadata(body.metadata);
    }

    if (body.mood !== undefined) {
      updates.mood =
        typeof body.mood === "string" && body.mood.trim().length > 0
          ? body.mood.trim()
          : null;
    }

    if (body.feeling_tags !== undefined) {
      if (body.feeling_tags === null) {
        updates.feeling_tags = [];
      } else {
        updates.feeling_tags = normalizeStringArray(body.feeling_tags) ?? [];
      }
    }

    if (body.linked_moments !== undefined) {
      if (body.linked_moments === null) {
        updates.linked_moments = [];
      } else {
        updates.linked_moments =
          normalizeUUIDArray(body.linked_moments) ?? [];
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse(400, {
        error: "At least one field must be provided for update",
      });
    }

    const { data, error } = await supabaseAdminClient
      .from("entries")
      .update(updates)
      .eq("id", entryId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error || !data) {
      console.error("[update_journal_entry] Update failed", error);
      return jsonResponse(
        error?.code === "PGRST116" ? 404 : 500,
        {
          error:
            error?.code === "PGRST116"
              ? "Entry not found"
              : "Failed to update journal entry",
        }
      );
    }

    const entry = data as RemoteJournalEntry;

    await logAuditEvent({
      userId: user.id,
      type: "update_journal_entry",
      subjectType: "entry",
      subjectId: entry.id,
      payload: {
        updated_fields: Object.keys(updates),
      },
    });

    return jsonResponse(200, entry);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error("[update_journal_entry] Unexpected error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
