/// <reference lib="deno.ns" />
import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import {
  AuthError,
  enforceRoles,
  requireAuthContext,
} from "../_shared/auth.ts";
import { logAuditEvent } from "../_shared/audit.ts";
import { isIsoDate, parseLimit } from "../_shared/validation.ts";

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

interface ListJournalsRequest {
  limit?: number;
  before?: string;
  type?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function normalizeEntryType(value: unknown): EntryType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "journal" ||
    normalized === "goal" ||
    normalized === "schedule"
  ) {
    return normalized as EntryType;
  }
  return undefined;
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

    const body: ListJournalsRequest = await req.json().catch(() => ({}));

    const limit = parseLimit(body.limit, DEFAULT_LIMIT, MAX_LIMIT);

    let before: string | undefined;
    if (typeof body.before === "string" && body.before.trim()) {
      if (!isIsoDate(body.before)) {
        return jsonResponse(400, {
          error: "before must be an ISO 8601 timestamp",
        });
      }
      before = body.before;
    }

    const entryType = normalizeEntryType(body.type);
    if (body.type && !entryType) {
      return jsonResponse(400, {
        error: "type must be journal, goal, or schedule",
      });
    }

    let query = supabaseAdminClient
      .from("entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    if (entryType) {
      query = query.eq("type", entryType);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[list_journals] Query failed", error);
      return jsonResponse(500, {
        error: "Failed to list journal entries",
      });
    }

    const items = (data ?? []) as RemoteJournalEntry[];

    await logAuditEvent({
      userId: user.id,
      type: "list_journals",
      subjectType: "entry",
      payload: {
        limit,
        before: before ?? null,
        type: entryType ?? null,
      },
    });

    return jsonResponse(200, items);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error("[list_journals] Unexpected error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
