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

interface FetchLatestAssistantMessagesRequest {
  conversation_ids?: unknown;
}

const MAX_IDS = 50;

function normalizeConversationIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!isUUID(trimmed)) continue;
    unique.add(trimmed);
  }

  return Array.from(unique);
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

    const body: FetchLatestAssistantMessagesRequest = await req
      .json()
      .catch(() => ({}));

    const conversationIds = normalizeConversationIds(
      body.conversation_ids
    );

    if (conversationIds.length === 0) {
      return jsonResponse(200, {});
    }

    if (conversationIds.length > MAX_IDS) {
      return jsonResponse(400, {
        error: `conversation_ids cannot exceed ${MAX_IDS} items`,
      });
    }

    const queryLimit = Math.min(conversationIds.length * 5, 250);

    const { data, error } = await supabaseAdminClient
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .in("conversation_id", conversationIds)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(queryLimit);

    if (error) {
      console.error(
        "[fetch_latest_assistant_messages] Query failed",
        error
      );
      return jsonResponse(500, {
        error: "Failed to fetch assistant messages",
      });
    }

    const rows = (data ?? []) as RemoteMessage[];
    const response: Record<string, RemoteMessage | null> = {};
    conversationIds.forEach((id) => {
      response[id] = null;
    });

    for (const message of rows) {
      if (response[message.conversation_id]) continue;
      response[message.conversation_id] = message;
    }

    await logAuditEvent({
      userId: user.id,
      type: "fetch_latest_assistant_messages",
      subjectType: "conversation",
      payload: {
        conversation_count: conversationIds.length,
      },
    });

    return jsonResponse(200, response);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error(
      "[fetch_latest_assistant_messages] Unexpected error",
      error
    );
    return jsonResponse(500, { error: "Internal server error" });
  }
});
