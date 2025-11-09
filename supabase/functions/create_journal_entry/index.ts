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
  normalizeStringArray,
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

interface CreateJournalEntryRequest {
  type?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  mood?: string | null;
  feeling_tags?: unknown;
}

function normalizeEntryType(value: unknown): EntryType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "journal" ||
    normalized === "goal" ||
    normalized === "schedule"
    ? (normalized as EntryType)
    : null;
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

    const body: CreateJournalEntryRequest = await req
      .json()
      .catch(() => ({}));

    const entryType = normalizeEntryType(body.type);
    if (!entryType) {
      return jsonResponse(400, {
        error: "type must be journal, goal, or schedule",
      });
    }

    const content =
      typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return jsonResponse(400, { error: "content is required" });
    }

    const mood =
      typeof body.mood === "string" && body.mood.trim().length > 0
        ? body.mood.trim()
        : null;

    const feelingTags = normalizeStringArray(body.feeling_tags) ?? [];

    const { data, error } = await supabaseAdminClient
      .from("entries")
      .insert({
        user_id: user.id,
        type: entryType,
        content,
        metadata: sanitizeMetadata(body.metadata),
        mood,
        feeling_tags: feelingTags,
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("[create_journal_entry] Insert failed", error);
      return jsonResponse(500, {
        error: "Failed to create journal entry",
      });
    }

    const entry = data as RemoteJournalEntry;

    await logAuditEvent({
      userId: user.id,
      type: "create_journal_entry",
      subjectType: "entry",
      subjectId: entry.id,
      payload: {
        type: entryType,
        mood,
        feeling_tags_count: feelingTags.length,
      },
    });

    return jsonResponse(200, entry);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error("[create_journal_entry] Unexpected error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
