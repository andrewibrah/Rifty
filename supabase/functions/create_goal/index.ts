/// <reference lib="deno.ns" />
/**
 * Create Goal - Goal creation with embedding generation and deduplication
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { generateEmbedding } from "../_shared/embedding.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MAX_ACTIVE_GOALS = 3;
const DEFAULT_DEDUPE_THRESHOLD = 0.9;

interface MicroStep {
  id: string;
  description: string;
  completed: boolean;
  completed_at: string | null;
}

interface RequestBody {
  title: string;
  description?: string;
  category?: string;
  target_date?: string;
  current_step?: string;
  micro_steps?: MicroStep[];
  source_entry_id?: string;
  metadata?: Record<string, any>;
  dedupe_threshold?: number;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function sanitizeMicroSteps(steps: any[]): MicroStep[] {
  if (!Array.isArray(steps)) return [];

  return steps.map((step) => ({
    id: step.id || crypto.randomUUID(),
    description: String(step.description ?? "").trim(),
    completed: Boolean(step.completed),
    completed_at: step.completed
      ? (step.completed_at ?? new Date().toISOString())
      : null,
  }));
}

function nextCurrentStep(steps: MicroStep[]): string | null {
  const pending = steps.find((step) => !step.completed);
  return pending ? pending.description : null;
}

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
    const user = await requireUser(accessToken);

    const body: RequestBody = await req.json();
    const title = body.title?.trim();

    if (!title) {
      return jsonResponse(400, { error: "Title is required" });
    }

    // Check active goals limit
    const { count } = await supabaseClient
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active");

    if ((count ?? 0) >= MAX_ACTIVE_GOALS) {
      return jsonResponse(400, {
        error: "MAX_ACTIVE_GOALS_REACHED",
        message: `You can only have ${MAX_ACTIVE_GOALS} active goals at a time`,
      });
    }

    // Generate embedding
    const textForEmbedding = [
      title,
      body.description ?? "",
      body.category ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    const embedding = await generateEmbedding(textForEmbedding || title);

    // Check for duplicates
    const dedupeThreshold = body.dedupe_threshold ?? DEFAULT_DEDUPE_THRESHOLD;
    const { data: existingGoals } = await supabaseClient
      .from("goals")
      .select(
        "id, title, category, embedding, micro_steps, description, metadata"
      )
      .eq("user_id", user.id);

    if (existingGoals && existingGoals.length > 0) {
      const normalizedTitle = title.toLowerCase();

      for (const goal of existingGoals) {
        const existingEmbedding = goal.embedding;
        if (!Array.isArray(existingEmbedding)) continue;

        const similarity = cosineSimilarity(embedding, existingEmbedding);
        if (similarity < dedupeThreshold) continue;

        const sameCategory =
          (goal.category ?? "").toLowerCase() ===
          (body.category ?? "").toLowerCase();
        const titleMatch = (goal.title ?? "").toLowerCase() === normalizedTitle;

        if (!sameCategory && !titleMatch) continue;

        // Merge with existing goal
        const existingSteps = sanitizeMicroSteps(goal.micro_steps ?? []);
        const newSteps = sanitizeMicroSteps(body.micro_steps ?? []);
        const mergedSteps = [...existingSteps];

        for (const step of newSteps) {
          if (!mergedSteps.find((s) => s.id === step.id)) {
            mergedSteps.push(step);
          }
        }

        const { data: updated, error: updateError } = await supabaseClient
          .from("goals")
          .update({
            description: body.description ?? goal.description,
            category: body.category ?? goal.category,
            target_date: body.target_date ?? goal.target_date,
            current_step: body.current_step ?? nextCurrentStep(mergedSteps),
            micro_steps: mergedSteps,
            metadata: { ...goal.metadata, ...body.metadata },
            embedding,
          })
          .eq("id", goal.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return jsonResponse(200, {
          goal: updated,
          merged: true,
          merged_with: goal.id,
        });
      }
    }

    // Create new goal
    const steps = sanitizeMicroSteps(body.micro_steps ?? []);

    const { data: newGoal, error: insertError } = await supabaseClient
      .from("goals")
      .insert({
        user_id: user.id,
        title,
        description: body.description ?? null,
        category: body.category ?? null,
        target_date: body.target_date ?? null,
        current_step: body.current_step ?? nextCurrentStep(steps),
        micro_steps: steps,
        source_entry_id: body.source_entry_id ?? null,
        metadata: body.metadata ?? {},
        status: "active",
        embedding,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Update progress cache
    const progress =
      steps.length > 0
        ? steps.filter((s) => s.completed).length / steps.length
        : 0;

    await supabaseClient.from("goal_progress_cache").upsert(
      {
        goal_id: newGoal.id,
        progress_pct: progress,
        coherence_score: 0,
        ghi_state: progress >= 0.9999 ? "complete" : "unknown",
        last_computed_at: new Date().toISOString(),
      },
      { onConflict: "goal_id" }
    );

    return jsonResponse(200, {
      goal: newGoal,
      merged: false,
    });
  } catch (error: any) {
    console.error("[create_goal] Error:", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message || "Unknown error",
    });
  }
});
