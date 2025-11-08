// @ts-nocheck
/// <reference lib="deno.ns" />
/**
 * update_goal - updates a goal for the authenticated user, regenerating embeddings when required
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { generateEmbedding } from "../_shared/embedding.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface MicroStepPayload {
  id: string;
  description: string;
  completed: boolean;
  completed_at: string | null;
}

interface UpdateGoalRequest {
  goal_id: string;
  updates: Record<string, unknown>;
}

const nowIso = () => new Date().toISOString();

const sanitizeMicroSteps = (value: unknown): MicroStepPayload[] => {
  if (!Array.isArray(value)) return [];
  const steps: MicroStepPayload[] = [];
  for (const step of value) {
    if (!step || typeof step !== "object") continue;
    const record = step as Record<string, unknown>;
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    if (!description) continue;
    const id = typeof record.id === "string" ? record.id : crypto.randomUUID();
    const completed = Boolean(record.completed);
    const completed_at = completed
      ? typeof record.completed_at === "string"
        ? record.completed_at
        : nowIso()
      : null;
    steps.push({ id, description, completed, completed_at });
  }
  return steps;
};

const computeProgress = (microSteps: MicroStepPayload[]) => {
  const total = microSteps.length;
  if (total === 0) return { completed: 0, total: 0, ratio: 0 };
  const completed = microSteps.filter((step) => step.completed).length;
  return { completed, total, ratio: completed / total };
};

const nextCurrentStep = (microSteps: MicroStepPayload[]): string | null => {
  const pending = microSteps.find((step) => !step.completed);
  return pending ? pending.description : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing authorization" });
    }

    const accessToken = authHeader.slice(7);
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const payload: UpdateGoalRequest = await req.json().catch(() => ({
      goal_id: "",
      updates: {},
    }));

    if (!payload.goal_id || typeof payload.goal_id !== "string") {
      return jsonResponse(400, { error: "goal_id is required" });
    }

    if (!payload.updates || typeof payload.updates !== "object") {
      return jsonResponse(400, { error: "updates object is required" });
    }

    const { data: existingGoal, error: existingError } = await supabaseClient
      .from("goals")
      .select("*")
      .eq("id", payload.goal_id)
      .eq("user_id", userData.user.id)
      .single();

    if (existingError) {
      if (existingError.code === "PGRST116") {
        return jsonResponse(404, { error: "Goal not found" });
      }
      throw existingError;
    }

    const updates = payload.updates as Record<string, unknown>;

    const microSteps = sanitizeMicroSteps(
      updates.micro_steps ?? existingGoal?.micro_steps ?? []
    );

    const requiresEmbedding = Boolean(
      typeof updates.title === "string" ||
        typeof updates.description === "string" ||
        typeof updates.category === "string"
    );

    const embeddingSource = [
      typeof updates.title === "string"
        ? updates.title
        : (existingGoal.title ?? ""),
      typeof updates.description === "string"
        ? updates.description
        : (existingGoal.description ?? ""),
      typeof updates.category === "string"
        ? updates.category
        : (existingGoal.category ?? ""),
    ]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .join("\n");

    let newEmbedding: number[] | undefined;
    if (requiresEmbedding) {
      newEmbedding = await generateEmbedding(
        embeddingSource || existingGoal.title || ""
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (typeof updates.title === "string") {
      updatePayload.title = updates.title.trim();
    }
    if (typeof updates.description === "string") {
      updatePayload.description = updates.description.trim();
    }
    if (typeof updates.category === "string") {
      updatePayload.category = updates.category.trim();
    }
    if (typeof updates.target_date === "string") {
      updatePayload.target_date = updates.target_date.trim() || null;
    }
    if (typeof updates.source_entry_id === "string") {
      updatePayload.source_entry_id = updates.source_entry_id.trim() || null;
    }
    if (typeof updates.metadata === "object" && updates.metadata) {
      updatePayload.metadata = updates.metadata;
    }

    updatePayload.micro_steps = microSteps;
    const computedProgress = computeProgress(microSteps);
    if (computedProgress.ratio >= 0.9999) {
      updatePayload.status = updates.status ?? "completed";
    } else if (typeof updates.status === "string") {
      updatePayload.status = updates.status;
    }

    if (newEmbedding) {
      updatePayload.embedding = newEmbedding;
    }

    updatePayload.current_step =
      typeof updates.current_step === "string"
        ? updates.current_step
        : nextCurrentStep(microSteps);

    const { data: updatedGoal, error: updateError } = await supabaseClient
      .from("goals")
      .update(updatePayload)
      .eq("id", payload.goal_id)
      .eq("user_id", userData.user.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    await supabaseClient.from("goal_progress_cache").upsert(
      {
        goal_id: payload.goal_id,
        progress_pct: computedProgress.ratio,
        coherence_score: 0,
        ghi_state:
          (updatedGoal?.status ?? existingGoal?.status) === "completed" ||
          computedProgress.ratio >= 0.9999
            ? "complete"
            : "unknown",
        last_computed_at: nowIso(),
      },
      { onConflict: "goal_id" }
    );

    return jsonResponse(200, { goal: updatedGoal });
  } catch (error: any) {
    console.error("[update_goal] error", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message ?? "Unknown error",
    });
  }
});
