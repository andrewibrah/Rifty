/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

type FailureType =
  | "wrong_intent"
  | "bad_data"
  | "poor_reasoning"
  | "confused_context"
  | "other";

type LessonScope = "intent" | "routing" | "style" | "safety";

interface FailurePayload {
  ai_event_id?: string | null;
  failure_type: FailureType;
  signal: string;
  metadata?: Record<string, unknown>;
  severity?: "low" | "medium" | "high";
}

const scopeMap: Record<FailureType, LessonScope> = {
  wrong_intent: "intent",
  bad_data: "safety",
  poor_reasoning: "style",
  confused_context: "routing",
  other: "style",
};

function synthesizeLesson(failureType: FailureType, signal: string): string {
  const trimmedSignal = signal.trim().replace(/\s+/g, " ");
  const baseSignal =
    trimmedSignal.length > 0
      ? `${trimmedSignal[0].toUpperCase()}${trimmedSignal.slice(1)}`
      : "Review the last exchange for actionable fixes.";

  switch (failureType) {
    case "wrong_intent":
      return `${baseSignal}. Confirm intent against the user's exact phrasing before responding.`;
    case "bad_data":
      return `${baseSignal}. Validate source data and flag missing context before generating a response.`;
    case "poor_reasoning":
      return `${baseSignal}. Slow down and outline reasoning steps explicitly to keep the answer grounded.`;
    case "confused_context":
      return `${baseSignal}. Rebuild the conversation context and restate key facts before responding.`;
    default:
      return `${baseSignal}. Capture the edge case so it feeds back into prompt tuning.`;
  }
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    console.error("[failure_tracker] requireUser failed", error);
    throw jsonResponse(401, {
      version: "spine.v1",
      error: "Invalid or expired access token",
    });
  }
  return data.user;
}

function sanitizeSignal(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 800);
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
    const rawBody = await req.json().catch(() => null);

    if (!rawBody || typeof rawBody !== "object") {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "Request body must be JSON",
      });
    }

    const payload = rawBody as FailurePayload;
    const failureType = payload.failure_type;
    const allowedTypes: FailureType[] = [
      "wrong_intent",
      "bad_data",
      "poor_reasoning",
      "confused_context",
      "other",
    ];

    if (!failureType || !allowedTypes.includes(failureType)) {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "failure_type is invalid",
      });
    }

    const signal = sanitizeSignal(payload.signal);
    if (!signal) {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "signal is required",
      });
    }

    let aiEventId: string | null = null;
    if (payload.ai_event_id && typeof payload.ai_event_id === "string") {
      aiEventId = payload.ai_event_id.trim() || null;
      if (aiEventId) {
        const { data: aiEvent, error: aiEventError } = await supabaseAdminClient
          .from("riflett_ai_event")
          .select("id, user_id")
          .eq("id", aiEventId)
          .maybeSingle();

        if (aiEventError) {
          console.error("[failure_tracker] failed to fetch ai_event", aiEventError);
          return jsonResponse(500, {
            version: "spine.v1",
            error: "Failed to validate ai_event",
          });
        }

        if (!aiEvent) {
          aiEventId = null;
        } else if (aiEvent.user_id !== user.id) {
          return jsonResponse(403, {
            version: "spine.v1",
            error: "Cannot associate failure with another user's event",
          });
        }
      }
    }

    const failureMetadata = {
      source: "failure_tracker",
      severity: payload.severity ?? "medium",
      ...payload.metadata,
    };

    const { data: failure, error: failureError } = await supabaseAdminClient
      .from("riflett_failure")
      .insert({
        user_id: user.id,
        ai_event_id: aiEventId,
        failure_type: failureType,
        signal,
        metadata: failureMetadata,
      })
      .select("id, created_at, failure_type, ai_event_id")
      .single();

    if (failureError) {
      console.error("[failure_tracker] insert failure failed", failureError);
      return jsonResponse(500, {
        version: "spine.v1",
        error: "Failed to record failure",
      });
    }

    const lessonText = synthesizeLesson(failureType, signal);
    const scope = scopeMap[failureType];

    const { data: lesson, error: lessonError } = await supabaseAdminClient
      .from("riflett_lesson")
      .insert({
        user_id: user.id,
        lesson_text: lessonText,
        scope,
        source_failure_id: failure.id,
      })
      .select("id, lesson_text, scope, created_at")
      .single();

    if (lessonError) {
      console.error("[failure_tracker] insert lesson failed", lessonError);
      return jsonResponse(500, {
        version: "spine.v1",
        error: "Failed to record lesson",
      });
    }

    const { data: recentLessons, error: recentError } = await supabaseAdminClient
      .from("riflett_lesson")
      .select("id, lesson_text, scope, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3);

    if (recentError) {
      console.error("[failure_tracker] fetch recent lessons failed", recentError);
      return jsonResponse(500, {
        version: "spine.v1",
        error: "Failed to load recent lessons",
      });
    }

    return jsonResponse(201, {
      version: "spine.v1",
      data: {
        failure,
        lesson,
        recent_lessons: recentLessons ?? [],
      },
    });
  } catch (error) {
    console.error("[failure_tracker] Unexpected error", error);
    if (error instanceof Response) {
      return error;
    }
    return jsonResponse(500, {
      version: "spine.v1",
      error: "Internal server error",
    });
  }
});
