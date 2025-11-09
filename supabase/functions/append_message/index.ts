/// <reference lib="deno.ns" />
import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import {
  AuthError,
  enforceRoles,
  requireAuthContext,
} from "../_shared/auth.ts";
import { logAuditEvent } from "../_shared/audit.ts";
import { isUUID, sanitizeMetadata } from "../_shared/validation.ts";

type MessageRole = "system" | "user" | "assistant";

interface AppendMessageRequest {
  conversation_id?: string;
  role?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

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

const ALLOWED_ROLES: MessageRole[] = ["system", "user", "assistant"];

function normalizeRole(value: unknown): MessageRole | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return ALLOWED_ROLES.includes(normalized as MessageRole)
    ? (normalized as MessageRole)
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

    const body: AppendMessageRequest = await req
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

    const normalizedRole = normalizeRole(body.role);
    if (!normalizedRole) {
      return jsonResponse(400, {
        error: "role must be one of system, user, assistant",
      });
    }

    const content =
      typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return jsonResponse(400, { error: "content is required" });
    }

    const { data: conversation, error: conversationError } =
      await supabaseAdminClient
        .from("entries")
        .select("id, user_id")
        .eq("id", conversationId)
        .maybeSingle();

    if (conversationError) {
      console.error(
        "[append_message] Failed to verify conversation",
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

    const { data, error } = await supabaseAdminClient
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: normalizedRole,
        content,
        metadata: sanitizeMetadata(body.metadata),
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("[append_message] Insert failed", error);
      return jsonResponse(500, {
        error: "Failed to append message",
      });
    }

    const message = data as RemoteMessage;

    await logAuditEvent({
      userId: user.id,
      type: "append_message",
      subjectType: "message",
      subjectId: message.id,
      payload: {
        conversation_id: conversationId,
        role: normalizedRole,
      },
    });

    return jsonResponse(200, message);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error("[append_message] Unexpected error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
