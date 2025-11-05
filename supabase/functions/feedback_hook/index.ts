/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

type FeedbackLabel = "helpful" | "unhelpful" | "neutral";

function normalizeTags(tags: unknown): string[] | null {
  if (!Array.isArray(tags)) return null;
  const sanitized = tags
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter((value) => value.length > 0);
  return sanitized.length > 0 ? Array.from(new Set(sanitized)).slice(0, 12) : null;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    console.error("[feedback_hook] requireUser failed", error);
    throw jsonResponse(401, {
      version: "spine.v1",
      error: "Invalid or expired access token",
    });
  }
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      version: "spine.v1",
      error: "Method not allowed",
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, {
        version: "spine.v1",
        error: "Missing Authorization header",
      });
    }

    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
      return jsonResponse(401, {
        version: "spine.v1",
        error: "Invalid Authorization header",
      });
    }

    const user = await requireUser(accessToken);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "Request body must be JSON",
      });
    }

    const aiEventId = typeof body.ai_event_id === "string" ? body.ai_event_id.trim() : "";
    if (!aiEventId) {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "ai_event_id is required",
      });
    }

    const label = typeof body.label === "string" ? (body.label.trim().toLowerCase() as FeedbackLabel) : null;
    const allowedLabels: FeedbackLabel[] = ["helpful", "unhelpful", "neutral"];
    if (!label || !allowedLabels.includes(label)) {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "label must be one of helpful | unhelpful | neutral",
      });
    }

    const correction =
      typeof body.correction === "string" && body.correction.trim().length > 0
        ? body.correction.trim().slice(0, 4000)
        : null;

    const tags = normalizeTags(body.tags);

    const confidence =
      body.confidence_from_model !== undefined ? Number(body.confidence_from_model) : undefined;
    const confidenceValue =
      confidence !== undefined && Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : null;

    const { data: aiEvent, error: aiEventError } = await supabaseAdminClient
      .from("riflett_ai_event")
      .select("id, user_id, intent, created_at")
      .eq("id", aiEventId)
      .maybeSingle();

    if (aiEventError) {
      console.error("[feedback_hook] Failed to fetch ai_event", aiEventError);
      return jsonResponse(500, {
        version: "spine.v1",
        error: "Failed to load AI event",
      });
    }

    if (!aiEvent) {
      return jsonResponse(404, {
        version: "spine.v1",
        error: "AI event not found",
      });
    }

    if (aiEvent.user_id !== user.id) {
      return jsonResponse(403, {
        version: "spine.v1",
        error: "Cannot submit feedback for another user",
      });
    }

    const requestId = crypto.randomUUID();
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      ai_event_id: aiEventId,
      label,
      correction,
      tags,
      confidence_from_model: confidenceValue,
      metadata: {
        source: "feedback_hook",
        request_id: requestId,
        user_agent: req.headers.get("user-agent") ?? null,
      },
    };

    const { data: inserted, error: insertError } = await supabaseAdminClient
      .from("riflett_feedback")
      .insert(insertPayload)
      .select("id, created_at, label, correction, tags, confidence_from_model")
      .single();

    if (insertError) {
      console.error("[feedback_hook] Insert failed", insertError);
      return jsonResponse(500, {
        version: "spine.v1",
        error: "Failed to record feedback",
      });
    }

    const notifyPromise = supabaseAdminClient.rpc("riflett_emit_feedback_notification", {
      feedback_id: inserted.id,
      ai_event_id: aiEventId,
      user_id: user.id,
    });

    const refreshPromise = supabaseAdminClient.rpc("refresh_riflett_feedback_stats");

    await Promise.allSettled([notifyPromise, refreshPromise]);

    return jsonResponse(200, {
      version: "spine.v1",
      data: {
        feedback: inserted,
        ai_event: {
          id: aiEvent.id,
          intent: aiEvent.intent,
          created_at: aiEvent.created_at,
        },
      },
    });
  } catch (error) {
    console.error("[feedback_hook] Unexpected error", error);
    if (error instanceof Response) {
      return error;
    }
    return jsonResponse(500, {
      version: "spine.v1",
      error: "Internal server error",
    });
  }
});
