import { supabaseAdminClient } from "./client.ts";
import {
  computeCoherenceScore,
  computeEmotionalConsistency,
  computeMomentum,
  computeProgress,
  computeReflectionDensity,
  computeDrift,
  type MicroStep,
  type ReflectionRecord,
} from "./goalMetrics.ts";

async function fetchReflections(goalId: string, userId: string) {
  const { data, error } = await supabaseAdminClient
    .from("goal_reflections")
    .select("alignment_score, created_at, emotion, entry_id")
    .eq("goal_id", goalId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[progress] fetchReflections error", error);
    throw new Error("Failed to fetch goal reflections");
  }

  return (data ?? []) as Array<{
    alignment_score: number;
    created_at: string;
    emotion: Record<string, unknown> | null;
    entry_id: string;
  }>;
}

async function fetchEntryEmbeddings(entryIds: string[]) {
  if (entryIds.length === 0) return new Map<string, number[]>();
  const { data, error } = await supabaseAdminClient
    .from("entries")
    .select("id, embedding")
    .in("id", entryIds);

  if (error) {
    console.error("[progress] fetchEntryEmbeddings error", error);
    throw new Error("Failed to fetch entry embeddings");
  }

  const map = new Map<string, number[]>();
  (data ?? []).forEach((row) => {
    if (Array.isArray(row.embedding)) {
      map.set(row.id, row.embedding as number[]);
    }
  });
  return map;
}

export async function recomputeGoalProgress(options: {
  goal: any;
  userId: string;
}): Promise<{
  progress_pct: number;
  coherence_score: number;
  ghi_state: "alive" | "dormant" | "misaligned" | "complete" | "unknown";
}> {
  const { goal, userId } = options;
  const reflections = await fetchReflections(goal.id, userId);
  const entryEmbeddingsMap = await fetchEntryEmbeddings(
    reflections.map((reflection) => reflection.entry_id),
  );

  const progress = computeProgress((goal.micro_steps ?? []) as MicroStep[]);
  const reflectionRecords: ReflectionRecord[] = reflections.map((reflection) => ({
    alignment_score: reflection.alignment_score,
    created_at: reflection.created_at,
    emotion: reflection.emotion ?? null,
    entry_embedding: entryEmbeddingsMap.get(reflection.entry_id) ?? null,
  }));

  const reflectionDensity = computeReflectionDensity(reflectionRecords);
  const emotionalConsistency = computeEmotionalConsistency(reflectionRecords);
  const momentum = computeMomentum((goal.micro_steps ?? []) as MicroStep[]);
  const drift = computeDrift(
    Array.isArray(goal.embedding) ? (goal.embedding as number[]) : null,
    reflectionRecords.map((record) => record.entry_embedding ?? null),
  );

  const coherenceScore = computeCoherenceScore({
    reflectionDensity,
    emotionalConsistency,
    momentum,
  });

  const ghiState = (() => {
    if (goal.status === "completed" || progress.pct >= 0.999) return "complete";
    if (drift < 0.7 && reflectionDensity < 0.3) return "misaligned";
    if (reflectionDensity < 0.2 && momentum < 0.2) return "dormant";
    if (reflectionDensity > 0.4 || momentum > 0.3) return "alive";
    return "unknown";
  })();

  const { error } = await supabaseAdminClient
    .from("goal_progress_cache")
    .upsert(
      {
        goal_id: goal.id,
        progress_pct: progress.pct,
        coherence_score,
        ghi_state: ghiState,
        last_computed_at: new Date().toISOString(),
      },
      { onConflict: "goal_id" },
    );

  if (error) {
    console.error("[progress] recomputeGoalProgress upsert error", error);
    throw new Error("Failed to update goal progress cache");
  }

  return {
    progress_pct: progress.pct,
    coherence_score: coherenceScore,
    ghi_state: ghiState,
  };
}
