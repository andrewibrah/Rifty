import { supabase } from "../lib/supabase";
import { debugIfTableMissing } from "../utils/supabaseErrors";
import {
  CreateGoalInputSchema,
  GoalSchema,
  GoalStatus,
  MicroStep,
  UpdateGoalInputSchema,
  type CreateGoalInput,
  type Goal,
  type UpdateGoalInput,
  type GoalContextItem,
  type GoalContextLinkedEntry,
} from "../types/goal";
import { generateUUID } from "../utils/id";
import { getDedupeThreshold } from "../utils/flags";
import {
  createGoalEdge,
  listActiveGoalsWithContextEdge,
  updateGoalEdge,
  type CreateGoalParams,
} from "./edgeFunctions";

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("User not authenticated");
  }
  return user.id;
}

function toISODate(value?: string): string | null {
  if (!value) return null;
  return value;
}

type MicroStepLike = Partial<MicroStep> & { description: string };

function sanitizeMicroSteps(
  steps: MicroStepLike[] | undefined | null
): MicroStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps.map((step) => ({
    id: step.id || generateUUID(),
    description: step.description.trim(),
    completed: Boolean(step.completed),
    completed_at: step.completed
      ? (step.completed_at ?? new Date().toISOString())
      : null,
  }));
}

function computeProgress(steps: MicroStep[]): {
  completed: number;
  total: number;
  ratio: number;
} {
  const total = steps.length;
  if (total === 0) {
    return { completed: 0, total: 0, ratio: 0 };
  }
  const completed = steps.filter((step) => step.completed).length;
  return { completed, total, ratio: completed / total };
}

export async function listActiveGoalsWithContext(
  uid?: string,
  limit = 5
): Promise<GoalContextItem[]> {
  const userId = uid ?? (await requireUserId());
  const goals = await listActiveGoalsWithContextEdge({
    limit,
    user_id: userId,
  });
  return goals;
}

async function upsertProgressCache(goal: Goal): Promise<void> {
  const steps = sanitizeMicroSteps(goal.micro_steps);
  const { ratio } = computeProgress(steps);
  const ghiState: string =
    goal.status === "completed" || ratio >= 0.9999 ? "complete" : "unknown";

  const { error } = await supabase.from("goal_progress_cache").upsert(
    {
      goal_id: goal.id,
      progress_pct: ratio,
      coherence_score: 0,
      ghi_state: ghiState,
      last_computed_at: new Date().toISOString(),
    },
    { onConflict: "goal_id" }
  );

  if (error) {
    console.error("[goals.unified] upsertProgressCache error", error);
  }
}

function nextCurrentStep(steps: MicroStep[]): string | null {
  const pending = steps.find((step) => !step.completed);
  return pending ? pending.description : null;
}

async function persistGoalUpdate({
  goalId,
  updates,
  newEmbedding,
}: {
  goalId: string;
  updates: UpdateGoalInput;
  newEmbedding?: number[];
}): Promise<Goal> {
  const sanitized = UpdateGoalInputSchema.parse(updates);

  const microSteps = sanitized.micro_steps
    ? sanitizeMicroSteps(sanitized.micro_steps as unknown as MicroStep[])
    : undefined;

  const payload: Record<string, any> = {
    ...sanitized,
  };

  if (microSteps) {
    payload.micro_steps = microSteps;
    payload.current_step =
      sanitized.current_step ?? nextCurrentStep(microSteps);
    const { ratio } = computeProgress(microSteps);
    if (ratio >= 0.9999) {
      payload.status = sanitized.status ?? "completed";
    }
  }

  if (sanitized.target_date === "") {
    payload.target_date = null;
  }

  if (newEmbedding) {
    payload.embedding = newEmbedding;
  }

  const { data, error } = await supabase
    .from("goals")
    .update(payload)
    .eq("id", goalId)
    .select("*")
    .single();

  if (error) {
    console.error("[goals.unified] persistGoalUpdate error", error);
    throw error;
  }

  const parsed = GoalSchema.parse(data);
  await upsertProgressCache(parsed);
  return parsed;
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const parsed = CreateGoalInputSchema.parse(input);

  const microSteps = sanitizeMicroSteps(
    (parsed.micro_steps as unknown as MicroStep[] | undefined) ?? []
  ).map((step) => ({
    id: step.id,
    description: step.description,
    completed: step.completed,
    completed_at: step.completed_at ?? null,
  }));

  const request: CreateGoalParams = {
    title: parsed.title,
    micro_steps: microSteps,
  };

  if (typeof parsed.description === "string" && parsed.description.length > 0) {
    request.description = parsed.description;
  }
  if (typeof parsed.category === "string" && parsed.category.length > 0) {
    request.category = parsed.category;
  }
  if (typeof parsed.target_date === "string" && parsed.target_date.length > 0) {
    request.target_date = parsed.target_date;
  }
  if (
    typeof parsed.current_step === "string" &&
    parsed.current_step.length > 0
  ) {
    request.current_step = parsed.current_step;
  }
  if (
    typeof parsed.source_entry_id === "string" &&
    parsed.source_entry_id.length > 0
  ) {
    request.source_entry_id = parsed.source_entry_id;
  }
  if (parsed.metadata) {
    request.metadata = parsed.metadata;
  }

  const dedupeThreshold = getDedupeThreshold();
  if (typeof dedupeThreshold === "number") {
    request.dedupe_threshold = dedupeThreshold;
  }

  const { goal: rawGoal } = await createGoalEdge(request);

  return GoalSchema.parse(rawGoal);
}

export async function updateGoalById(
  goalId: string,
  updates: UpdateGoalInput
): Promise<Goal> {
  if (!goalId) {
    throw new Error("Goal id required");
  }

  return updateGoalEdge(goalId, updates);
}

export async function getGoalById(goalId: string): Promise<Goal | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[goals.unified] getGoalById error", error);
    throw error;
  }

  return data ? GoalSchema.parse(data) : null;
}

export async function listGoals(
  options: {
    status?: GoalStatus;
    limit?: number;
  } = {}
): Promise<Goal[]> {
  const userId = await requireUserId();
  const limit = options.limit ?? 50;

  let query = supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[goals.unified] listGoals error", error);
    throw error;
  }

  return GoalSchema.array().parse(data ?? []);
}

export async function deleteGoal(goalId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId)
    .eq("user_id", userId);

  if (error) {
    console.error("[goals.unified] deleteGoal error", error);
    throw error;
  }
}

export async function completeMicroStep(
  goalId: string,
  stepId: string
): Promise<Goal> {
  const goal = await getGoalById(goalId);
  if (!goal) {
    throw new Error("Goal not found");
  }

  const updatedSteps = goal.micro_steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          completed: true,
          completed_at: step.completed_at ?? new Date().toISOString(),
        }
      : step
  );

  return updateGoalById(goalId, { micro_steps: updatedSteps });
}

export async function addMicroStep(
  goalId: string,
  description: string
): Promise<Goal> {
  const goal = await getGoalById(goalId);
  if (!goal) {
    throw new Error("Goal not found");
  }

  const newStep: MicroStep = {
    id: generateUUID(),
    description: description.trim(),
    completed: false,
    completed_at: null,
  };

  return updateGoalById(goalId, {
    micro_steps: [...goal.micro_steps, newStep],
  });
}
