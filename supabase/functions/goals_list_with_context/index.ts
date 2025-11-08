// @ts-nocheck
/// <reference lib="deno.ns" />
/**
 * goals_list_with_context - returns active goals with context for the authenticated user
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface MicroStepRecord {
  id: string;
  description: string;
  completed: boolean;
  completed_at: string | null;
}

interface GoalContextLinkedEntry {
  id: string;
  created_at: string;
  snippet: string;
}

interface GoalContextItem {
  id: string;
  title: string;
  status: string;
  priority_score: number;
  target_date: string | null;
  current_step: string | null;
  micro_steps: MicroStepRecord[];
  progress: {
    completed: number;
    total: number;
    ratio: number;
  };
  description: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown>;
  source_entry_id: string | null;
  conflicts: string[];
  linked_entries: GoalContextLinkedEntry[];
}

const nowIso = () => new Date().toISOString();

const sanitizeMicroSteps = (value: unknown): MicroStepRecord[] => {
  if (!Array.isArray(value)) return [];
  const steps: MicroStepRecord[] = [];
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

const computeProgress = (microSteps: MicroStepRecord[]) => {
  const total = microSteps.length;
  if (total === 0) {
    return { completed: 0, total: 0, ratio: 0 };
  }
  const completed = microSteps.filter((step) => step.completed).length;
  return { completed, total, ratio: completed / total };
};

const nextCurrentStep = (microSteps: MicroStepRecord[]): string | null => {
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

    const requestBody = await req.json().catch(() => ({}));
    const requestedUserId =
      typeof requestBody?.user_id === "string"
        ? requestBody.user_id
        : userData.user.id;

    if (requestedUserId !== userData.user.id) {
      return jsonResponse(403, { error: "Forbidden" });
    }

    const limit = Math.max(
      1,
      Math.min(
        typeof requestBody?.limit === "number" ? requestBody.limit : 5,
        10
      )
    );

    const now = new Date();

    const [featuresRes, prioritiesRes] = await Promise.all([
      supabaseClient
        .from("features")
        .select("key, value_json")
        .eq("user_id", requestedUserId)
        .in("key", ["why_model", "risk_flags", "cadence_profile"]),
      supabaseClient
        .from("mv_goal_priority")
        .select("goal_id, priority_score")
        .eq("user_id", requestedUserId)
        .order("priority_score", { ascending: false })
        .limit(limit * 3),
    ]);

    if (prioritiesRes.error) {
      throw prioritiesRes.error;
    }

    const priorities = (prioritiesRes.data ?? []).filter(
      (row): row is { goal_id: string; priority_score: number | null } =>
        typeof row?.goal_id === "string"
    );

    if (!priorities.length) {
      return jsonResponse(200, { goals: [] });
    }

    const priorityMap = new Map<string, number>();
    const goalIdSet = new Set<string>();
    priorities.forEach((row) => {
      priorityMap.set(row.goal_id, Number(row.priority_score ?? 0));
      goalIdSet.add(row.goal_id);
    });

    const [goalRowsRes, reflectionsRes] = await Promise.all([
      supabaseClient
        .from("goals")
        .select("*")
        .in("id", Array.from(goalIdSet))
        .eq("user_id", requestedUserId),
      supabaseClient
        .from("goal_reflections")
        .select("goal_id, entry_id, created_at")
        .in("goal_id", Array.from(goalIdSet))
        .order("created_at", { ascending: false }),
    ]);

    if (goalRowsRes.error) {
      throw goalRowsRes.error;
    }

    const parsedGoals = (goalRowsRes.data ?? []).filter(
      (goal) => goal && typeof goal === "object" && goal.status === "active"
    );

    parsedGoals.sort(
      (a: any, b: any) =>
        (priorityMap.get(b.id) ?? 0) - (priorityMap.get(a.id) ?? 0)
    );

    const activeGoals = parsedGoals.slice(0, limit);

    if (!activeGoals.length) {
      return jsonResponse(200, { goals: [] });
    }

    const activeGoalIds = activeGoals.map((goal: any) => String(goal.id));

    const reflectionsByGoal = new Map<
      string,
      Array<{ entry_id: string; created_at: string }>
    >();
    const entryIds = new Set<string>();

    if (reflectionsRes.data) {
      for (const row of reflectionsRes.data) {
        if (
          typeof row.goal_id !== "string" ||
          typeof row.entry_id !== "string"
        ) {
          continue;
        }
        if (!reflectionsByGoal.has(row.goal_id)) {
          reflectionsByGoal.set(row.goal_id, []);
        }
        const bucket = reflectionsByGoal.get(row.goal_id)!;
        if (bucket.length < 3) {
          bucket.push({
            entry_id: row.entry_id,
            created_at: row.created_at ?? nowIso(),
          });
        }
        entryIds.add(row.entry_id);
      }
    }

    const entryMap = new Map<
      string,
      { id: string; content: string; created_at: string }
    >();
    if (entryIds.size > 0) {
      const entriesRes = await supabaseClient
        .from("entries")
        .select("id, content, created_at")
        .in("id", Array.from(entryIds))
        .eq("user_id", requestedUserId);

      if (!entriesRes.error) {
        for (const row of entriesRes.data ?? []) {
          if (typeof row.id === "string") {
            entryMap.set(row.id, {
              id: row.id,
              content: typeof row.content === "string" ? row.content : "",
              created_at: row.created_at ?? nowIso(),
            });
          }
        }
      }
    }

    const goals: GoalContextItem[] = activeGoals.map((goal: any) => {
      const microSteps = sanitizeMicroSteps(goal.micro_steps);
      const progress = computeProgress(microSteps);
      const currentStep = goal.current_step ?? nextCurrentStep(microSteps);

      const metadata =
        goal.metadata && typeof goal.metadata === "object"
          ? (goal.metadata as Record<string, unknown>)
          : {};

      const conflicts = Array.isArray(metadata.conflicts)
        ? metadata.conflicts.filter((value) => typeof value === "string")
        : [];

      const linkedEntriesRaw = reflectionsByGoal.get(String(goal.id)) ?? [];
      const linked_entries: GoalContextLinkedEntry[] = linkedEntriesRaw
        .map((row) => entryMap.get(row.entry_id))
        .filter(
          (
            entry
          ): entry is { id: string; content: string; created_at: string } =>
            Boolean(entry)
        )
        .map((entry) => ({
          id: entry.id,
          created_at: entry.created_at,
          snippet: entry.content.slice(0, 200),
        }));

      return {
        id: String(goal.id),
        title: String(goal.title ?? "Untitled goal"),
        status: String(goal.status ?? "active"),
        priority_score: priorityMap.get(String(goal.id)) ?? 0,
        target_date:
          typeof goal.target_date === "string" ? goal.target_date : null,
        current_step: currentStep,
        micro_steps: microSteps,
        progress,
        description:
          typeof goal.description === "string" ? goal.description : null,
        updated_at: goal.updated_at ?? null,
        metadata,
        source_entry_id:
          typeof goal.source_entry_id === "string"
            ? goal.source_entry_id
            : null,
        conflicts,
        linked_entries,
      };
    });

    return jsonResponse(200, { goals });
  } catch (error: any) {
    console.error("[goals_list_with_context] error", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message ?? "Unknown error",
    });
  }
});
