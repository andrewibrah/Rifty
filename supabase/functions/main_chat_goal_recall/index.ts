/// <reference lib="deno.ns" />

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import { generateEmbedding } from "../_shared/embedding.ts";
import { recomputeGoalProgress } from "../_shared/progress.ts";
import { resolveLinkThreshold } from "../_shared/goalMetrics.ts";

const MAX_CANDIDATES = 5;
const MIN_RESPONSE_THRESHOLD = 0.6;

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Response(JSON.stringify({ error: "Invalid access token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return data.user;
}

async function fetchGoal(goalId: string, userId: string) {
  const { data, error } = await supabaseAdminClient
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[main_chat_goal_recall] fetchGoal error", error);
    throw new Error("Failed to load goal");
  }
  return data;
}

async function ensureGoalHealth(goal: any, userId: string) {
  const { data, error } = await supabaseAdminClient
    .from("goal_progress_cache")
    .select("progress_pct, coherence_score, ghi_state")
    .eq("goal_id", goal.id)
    .maybeSingle();
  if (error) {
    console.error("[main_chat_goal_recall] progress cache fetch error", error);
    throw new Error("Failed to fetch goal progress cache");
  }
  if (data) return data;
  return recomputeGoalProgress({ goal, userId });
}

function buildSuggestedAction(ghiState: string, nextStep: string | null) {
  switch (ghiState) {
    case "misaligned":
      return "Revisit why this goal matters and capture a quick reflection.";
    case "dormant":
      return nextStep
        ? `Schedule a 15-minute block to tackle "${nextStep}" today.`
        : "Commit to one small milestone in the next 48 hours.";
    case "alive":
      return nextStep
        ? `Keep momentum: focus on "${nextStep}" next.`
        : "Celebrate progress and set the next micro-step.";
    case "complete":
      return "Goal marked complete — consider archiving or defining a new stretch.";
    default:
      return nextStep
        ? `Consider nudging "${nextStep}" forward this week.`
        : "Add a concrete micro-step to regain clarity.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing Authorization header" });
    }
    const accessToken = authHeader.slice(7).trim();
    const user = await requireUser(accessToken);

    const body = await req.json().catch(() => ({}));
    const utterance = typeof body.utterance === "string" ? body.utterance.trim() : "";
    if (!utterance) {
      return jsonResponse(400, { error: "utterance is required" });
    }

    const embedding = await generateEmbedding(utterance);
    const threshold = Math.max(MIN_RESPONSE_THRESHOLD, resolveLinkThreshold() - 0.1);

    const { data: candidates, error: candidateError } = await supabaseAdminClient.rpc(
      "match_goal_embeddings",
      {
        query_embedding: embedding,
        match_user_id: user.id,
        match_threshold: threshold,
        match_count: MAX_CANDIDATES,
      },
    );

    if (candidateError) {
      console.error("[main_chat_goal_recall] match_goal_embeddings error", candidateError);
      throw new Error("Failed to fetch goal candidates");
    }

    const matches = (candidates ?? []) as Array<{
      goal_id: string;
      similarity: number;
    }>;

    if (matches.length === 0) {
      return jsonResponse(200, { result: null });
    }

    const top = matches[0];
    const goal = await fetchGoal(top.goal_id, user.id);
    if (!goal) {
      return jsonResponse(200, { result: null });
    }

    const health = await ensureGoalHealth(goal, user.id);
    const suggestedAction = buildSuggestedAction(health.ghi_state, goal.current_step);

    const summary = `Matched ${goal.title} (${Math.round((health.progress_pct ?? 0) * 100)}% progress, ${health.ghi_state}).`;

    const { error: sessionError } = await supabaseAdminClient
      .from("ai_goal_sessions")
      .insert({
        user_id: user.id,
        goal_id: goal.id,
        utterance,
        response_summary: suggestedAction,
      });

    if (sessionError) {
      console.error("[main_chat_goal_recall] session insert error", sessionError);
    }

    return jsonResponse(200, {
      result: {
        goal: {
          id: goal.id,
          title: goal.title,
          status: goal.status,
          current_step: goal.current_step,
          progress_pct: health.progress_pct,
          coherence_score: health.coherence_score,
          ghi_state: health.ghi_state,
        },
        similarity: top.similarity,
        rationale: summary,
        suggested_action: suggestedAction,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[main_chat_goal_recall] unhandled error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
