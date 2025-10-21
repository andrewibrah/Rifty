/// <reference lib="deno.ns" />

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import { generateEmbedding } from "../_shared/embedding.ts";
import { recomputeGoalProgress } from "../_shared/progress.ts";

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

async function ensureGoalEmbedding(goal: any) {
  if (Array.isArray(goal.embedding) && goal.embedding.length > 0) {
    return goal.embedding as number[];
  }
  const text = [goal.title, goal.description ?? "", goal.category ?? ""].join("\n");
  const embedding = await generateEmbedding(text.trim() || goal.title);
  const { error } = await supabaseAdminClient
    .from("goals")
    .update({ embedding })
    .eq("id", goal.id)
    .eq("user_id", goal.user_id);
  if (error) {
    console.error("[compute_goal_health] ensureGoalEmbedding error", error);
    throw new Error("Failed to update goal embedding");
  }
  goal.embedding = embedding;
  return embedding;
}

async function loadGoals(options: {
  userId: string;
  goalId?: string;
  statuses?: string[];
}) {
  const { userId, goalId, statuses } = options;
  let query = supabaseAdminClient
    .from("goals")
    .select("*")
    .eq("user_id", userId);

  if (goalId) {
    query = query.eq("id", goalId);
  }
  if (Array.isArray(statuses) && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[compute_goal_health] loadGoals error", error);
    throw new Error("Failed to load goals");
  }
  return data ?? [];
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
    const goalId = typeof body.goal_id === "string" ? body.goal_id : undefined;
    const includeStatuses = Array.isArray(body.statuses)
      ? body.statuses.filter((value: unknown): value is string => typeof value === "string")
      : undefined;

    const goals = await loadGoals({
      userId: user.id,
      goalId,
      statuses: includeStatuses ?? ["active", "paused"],
    });

    if (goals.length === 0) {
      return jsonResponse(200, { results: [] });
    }

    const results = [] as Array<{
      goal_id: string;
      progress_pct: number;
      coherence_score: number;
      ghi_state: string;
    }>;

    for (const goal of goals) {
      await ensureGoalEmbedding(goal);
      const metrics = await recomputeGoalProgress({ goal, userId: user.id });
      results.push({
        goal_id: goal.id,
        progress_pct: metrics.progress_pct,
        coherence_score: metrics.coherence_score,
        ghi_state: metrics.ghi_state,
      });
    }

    return jsonResponse(200, { results });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[compute_goal_health] unhandled error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
