/// <reference lib="deno.ns" />

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import { generateEmbedding } from "../_shared/embedding.ts";
import { resolveLinkThreshold } from "../_shared/goalMetrics.ts";
import { recomputeGoalProgress } from "../_shared/progress.ts";

const DEFAULT_CANDIDATE_COUNT = 5;

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

async function fetchEntry(entryId: string, userId: string) {
  const { data, error } = await supabaseAdminClient
    .from("entries")
    .select("id, user_id, content, embedding, created_at")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[link_reflections] fetchEntry error", error);
    throw new Error("Failed to fetch entry");
  }
  if (!data) {
    throw new Error("Entry not found");
  }
  return data;
}

async function ensureEntryEmbedding(entry: any): Promise<number[]> {
  if (Array.isArray(entry.embedding) && entry.embedding.length > 0) {
    return entry.embedding as number[];
  }

  const embedding = await generateEmbedding(entry.content ?? "");
  const { error: updateError } = await supabaseAdminClient
    .from("entries")
    .update({ embedding })
    .eq("id", entry.id);

  if (updateError) {
    console.error("[link_reflections] ensureEntryEmbedding update error", updateError);
    throw new Error("Unable to persist entry embedding");
  }

  return embedding;
}

async function fetchCandidateGoals(options: {
  embedding: number[];
  userId: string;
  threshold: number;
  limit: number;
}) {
  const { embedding, userId, threshold, limit } = options;
  const { data, error } = await supabaseAdminClient.rpc(
    "match_goal_embeddings",
    {
      query_embedding: embedding,
      match_user_id: userId,
      match_threshold: threshold,
      match_count: limit,
    },
  );

  if (error) {
    console.error("[link_reflections] match_goal_embeddings error", error);
    throw new Error("Failed to fetch goal candidates");
  }

  return (data ?? []) as Array<{
    goal_id: string;
    similarity: number;
  }>;
}

async function loadGoals(goalIds: string[], userId: string) {
  if (goalIds.length === 0) return [] as any[];
  const { data, error } = await supabaseAdminClient
    .from("goals")
    .select("*")
    .in("id", goalIds)
    .eq("user_id", userId);
  if (error) {
    console.error("[link_reflections] loadGoals error", error);
    throw new Error("Failed to load goals");
  }
  return data ?? [];
}

async function upsertReflection(payload: {
  userId: string;
  goalId: string;
  entryId: string;
  alignmentScore: number;
  note: string | null;
}) {
  const { userId, goalId, entryId, alignmentScore, note } = payload;
  const { data, error } = await supabaseAdminClient
    .from("goal_reflections")
    .upsert(
      {
        user_id: userId,
        goal_id: goalId,
        entry_id: entryId,
        alignment_score: alignmentScore,
        note,
      },
      { onConflict: "user_id,goal_id,entry_id" },
    )
    .select("*")
    .single();

  if (error) {
    console.error("[link_reflections] upsertReflection error", error);
    throw new Error("Failed to link reflection");
  }

  return data;
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
    const entryId = typeof body.entry_id === "string" ? body.entry_id : null;
    const candidateLimit = Math.max(
      1,
      Math.min(
        typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_CANDIDATE_COUNT,
        10,
      ),
    );

    if (!entryId) {
      return jsonResponse(400, { error: "entry_id is required" });
    }

    const entry = await fetchEntry(entryId, user.id);
    const entryEmbedding = await ensureEntryEmbedding(entry);

    const threshold = resolveLinkThreshold();
    const candidates = await fetchCandidateGoals({
      embedding: entryEmbedding,
      userId: user.id,
      threshold,
      limit: candidateLimit,
    });

    if (candidates.length === 0) {
      return jsonResponse(200, {
        linked: [],
        message: "No goals passed alignment threshold",
      });
    }

    const goalIds = candidates.map((candidate) => candidate.goal_id);
    const goals = await loadGoals(goalIds, user.id);
    const goalsById = new Map(goals.map((goal) => [goal.id, goal]));

    const linked: Array<{
      goal_id: string;
      alignment_score: number;
    }> = [];

    for (const candidate of candidates) {
      const goal = goalsById.get(candidate.goal_id);
      if (!goal) continue;
      const similarity = candidate.similarity;
      if (similarity < threshold) continue;

      const note = typeof entry.content === "string"
        ? entry.content.slice(0, 240)
        : null;

      const reflection = await upsertReflection({
        userId: user.id,
        goalId: goal.id,
        entryId: entry.id,
        alignmentScore: Math.min(1, Math.max(0, similarity)),
        note,
      });

      await recomputeGoalProgress({ goal, userId: user.id });

      linked.push({
        goal_id: goal.id,
        alignment_score: reflection.alignment_score,
      });
    }

    return jsonResponse(200, { linked });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[link_reflections] unhandled error", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
