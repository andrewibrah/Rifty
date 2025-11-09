/// <reference lib="deno.ns" />
import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import {
  AuthError,
  enforceRoles,
  requireAuthContext,
} from "../_shared/auth.ts";
import { logAuditEvent } from "../_shared/audit.ts";
import { isIsoDate, isUUID, parseLimit } from "../_shared/validation.ts";

type MessageRole = "system" | "user" | "assistant";

interface RemoteMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ListMessagesRequest {
  conversation_id?: string;
  limit?: number;
  before?: string;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function sortChronologically(
  messages: RemoteMessage[]
): RemoteMessage[] {
  return [...messages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime()
  );
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

    const body: ListMessagesRequest = await req
      .json()
      .catch(() => ({}));

    const conversationId =
      typeof body.conversation_id === "string"
        ? body.conversation_id.trim()
        : "";

    if (!isUUID(conversationId)) {
      return jsonResponse(400, {
        error: "conversation_id must be a valid UUID",
      });
    }

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

    const { data: conversation, error: conversationError } =
      await supabaseAdminClient
        .from("entries")
        .select("id, user_id")
        .eq("id", conversationId)
        .maybeSingle();

    if (conversationError) {
      console.error(
        "[list_messages] Failed to verify conversation",
        conversationError
      );
      return jsonResponse(500, {
        error: "Failed to verify conversation ownership",
      });
    }

    if (!conversation) {
      return jsonResponse(404, { error: "Conversation not found" });
    }

    if (conversation.user_id !== user.id) {
      return jsonResponse(403, { error: "Forbidden" });
    }

    let query = supabaseAdminClient
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[list_messages] Query failed", error);
      return jsonResponse(500, {
        error: "Failed to list messages",
      });
    }

    const rows = (data ?? []) as RemoteMessage[];
    const ordered = sortChronologically(rows);

    await logAuditEvent({
      userId: user.id,
      type: "list_messages",
      subjectType: "conversation",
      subjectId: conversationId,
      payload: {
        limit,
        before: before ?? null,
      },
    });

    return jsonResponse(200, ordered);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error("[list_messages] Unexpected error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
