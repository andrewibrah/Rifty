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

interface LogIntentAuditRequest {
  entry_id?: string;
  prompt?: string;
  predicted_intent?: string;
  correct_intent?: string;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

    const body: LogIntentAuditRequest = await req
      .json()
      .catch(() => ({}));

    const entryId =
      typeof body.entry_id === "string" ? body.entry_id.trim() : "";

    if (!isUUID(entryId)) {
      return jsonResponse(400, {
        error: "entry_id must be a valid UUID",
      });
    }

    const prompt = normalizeText(body.prompt);
    const predictedIntent = normalizeText(body.predicted_intent);
    const correctIntent = normalizeText(body.correct_intent);

    if (!prompt || !predictedIntent || !correctIntent) {
      return jsonResponse(400, {
        error: "prompt, predicted_intent, and correct_intent are required",
      });
    }

    const { data: entry, error: fetchError } = await supabaseAdminClient
      .from("entries")
      .select("id, user_id")
      .eq("id", entryId)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "[log_intent_audit] Failed to verify entry",
        fetchError
      );
      return jsonResponse(500, {
        error: "Failed to verify entry ownership",
      });
    }

    if (!entry || entry.user_id !== user.id) {
      return jsonResponse(403, { error: "Forbidden" });
    }

    const { error } = await supabaseAdminClient
      .from("intent_audits")
      .insert({
        user_id: user.id,
        entry_id: entryId,
        prompt,
        predicted_intent: predictedIntent,
        correct_intent: correctIntent,
      });

    if (error) {
      console.error("[log_intent_audit] Insert failed", error);
      return jsonResponse(500, {
        error: "Failed to log intent audit",
      });
    }

    await logAuditEvent({
      userId: user.id,
      type: "log_intent_audit",
      subjectType: "entry",
      subjectId: entryId,
      payload: {
        intent_labels: {
          predicted: predictedIntent,
          corrected: correctIntent,
        },
      },
    });

    return jsonResponse(200, { logged: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error("[log_intent_audit] Unexpected error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
