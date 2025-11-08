/**
 * Edge Function API Wrappers
 * Frontend interface to Supabase Edge Functions
 */

import { supabase } from "../lib/supabase";
import type { GoalContextItem, Goal, UpdateGoalInput } from "../types/goal";
import type { ClassifiedEntry } from "../lib/entries";

export interface OperatingPictureResult {
  why_model: Record<string, unknown> | null;
  top_goals: any[];
  hot_entries: any[];
  next_72h: any[];
  cadence_profile: {
    cadence: string;
    session_length_minutes: number;
    last_message_at: string | null;
    missed_day_count: number;
    current_streak: number;
    timezone: string;
  };
  risk_flags: string[];
}

export interface RagSearchParams {
  query: string;
  scope?:
    | "entry"
    | "goal"
    | "schedule"
    | "all"
    | Array<"entry" | "goal" | "schedule">;
  limit?: number;
}

export interface RagSearchResult {
  results: Array<{
    id: string;
    kind: "entry" | "goal" | "schedule";
    score: number;
    title?: string;
    snippet: string;
    metadata: Record<string, unknown>;
  }>;
  total: number;
  query: string;
}

export interface CreateGoalParams {
  title: string;
  description?: string;
  category?: string;
  target_date?: string;
  current_step?: string;
  micro_steps?: Array<{
    id?: string;
    description: string;
    completed?: boolean;
    completed_at?: string | null;
  }>;
  source_entry_id?: string;
  metadata?: Record<string, any>;
  dedupe_threshold?: number;
}

export interface CreateGoalResult {
  goal: any;
  merged: boolean;
  merged_with?: string;
}

export interface AnalystQueryParams {
  query: string;
  limit?: number;
}

export interface AnalystQueryResult {
  answer: string;
  citations?: Array<{
    entry_id: string;
    date: string;
    snippet: string;
  }>;
  relevant_facts?: string[];
}

/**
 * Get operating picture - multi-table memory aggregation
 */
export async function getOperatingPicture(): Promise<OperatingPictureResult> {
  // TEMPORARY: Use diagnostic function to identify the issue
  const { data: testData, error: testError } = await supabase.functions.invoke(
    "test_operating_picture",
    {
      method: "POST",
      body: {},
    }
  );

  console.log("=== DIAGNOSTIC TEST ===");
  if (testError) {
    console.error("Test error:", testError);
  }
  console.log("Test results:", JSON.stringify(testData, null, 2));
  console.log("======================");

  const { data, error } =
    await supabase.functions.invoke<OperatingPictureResult>(
      "get_operating_picture",
      {
        method: "POST",
        body: {},
      }
    );

  if (error) {
    console.error("[getOperatingPicture] Error:", error);
    console.error("[getOperatingPicture] Error message:", error.message);
    console.error("[getOperatingPicture] Error context:", error.context);
    // The actual error response from server is in data even when there's an error
    console.error(
      "[getOperatingPicture] Server error response:",
      JSON.stringify(data, null, 2)
    );
    throw error;
  }

  return data!;
}

/**
 * RAG search across entries, goals, and schedules
 */
export async function ragSearch(
  params: RagSearchParams
): Promise<RagSearchResult> {
  const { data, error } = await supabase.functions.invoke<RagSearchResult>(
    "rag_search",
    {
      method: "POST",
      body: params,
    }
  );

  if (error) {
    console.error("[ragSearch] Error:", error);
    throw error;
  }

  return data!;
}

/**
 * Create goal with embedding generation and deduplication
 */
export async function createGoalEdge(
  params: CreateGoalParams
): Promise<CreateGoalResult> {
  const { data, error } = await supabase.functions.invoke<CreateGoalResult>(
    "create_goal",
    {
      method: "POST",
      body: params,
    }
  );

  if (error) {
    console.error("[createGoalEdge] Error:", error);
    throw error;
  }

  return data!;
}

/**
 * Ask analyst questions about journal entries
 */
export async function askAnalyst(
  params: AnalystQueryParams
): Promise<AnalystQueryResult> {
  const { data, error } = await supabase.functions.invoke<AnalystQueryResult>(
    "analyst_query",
    {
      method: "POST",
      body: params,
    }
  );

  if (error) {
    console.error("[askAnalyst] Error:", error);
    throw error;
  }

  return data!;
}

/**
 * List active goals with context
 */
export interface GoalsListWithContextParams {
  limit?: number;
  user_id?: string;
}

export async function listActiveGoalsWithContextEdge(
  params: GoalsListWithContextParams = {}
): Promise<GoalContextItem[]> {
  const { data, error } = await supabase.functions.invoke<{
    goals: GoalContextItem[];
  }>("goals_list_with_context", {
    method: "POST",
    body: params,
  });

  if (error) {
    console.error("[listActiveGoalsWithContextEdge] Error:", error);
    throw error;
  }

  return data?.goals ?? [];
}

/**
 * Update a goal (including embedding refresh and progress sync)
 */
export async function updateGoalEdge(
  goalId: string,
  updates: UpdateGoalInput
): Promise<Goal> {
  const { data, error } = await supabase.functions.invoke<{ goal: Goal }>(
    "update_goal",
    {
      method: "POST",
      body: {
        goal_id: goalId,
        updates,
      },
    }
  );

  if (error) {
    console.error("[updateGoalEdge] Error:", error);
    throw error;
  }

  return data?.goal as Goal;
}

/**
 * Payload for create_entry_from_chat edge function
 */
export interface CreateEntryFromChatParams {
  content: string;
  entryType: string;
  intent: Record<string, any>;
  note?: Record<string, any> | null | undefined;
  processingTimeline?: any[] | undefined;
  nativeIntent?: Record<string, any> | null | undefined;
  enriched?: Record<string, any> | null | undefined;
  decision?: Record<string, any> | null | undefined;
  redaction?: Record<string, any> | null | undefined;
  memoryMatches?: any[] | undefined;
  plan?: Record<string, any> | null | undefined;
  goalsV2Enabled?: boolean;
}

interface CreateEntryFromChatResponse {
  entry: ClassifiedEntry;
}

export async function createEntryFromChatEdge(
  params: CreateEntryFromChatParams
): Promise<ClassifiedEntry> {
  const { data, error } =
    await supabase.functions.invoke<CreateEntryFromChatResponse>(
      "create_entry_from_chat",
      {
        method: "POST",
        body: params,
      }
    );

  if (error) {
    console.error("[createEntryFromChatEdge] Error:", error);
    throw error;
  }

  return data!.entry;
}

export interface PersistUserFactsParams {
  facts: Array<{
    key: string;
    value: unknown;
    confidence?: number;
    tags?: string[];
    source?: string;
  }>;
  user_id?: string;
}

export interface PersistUserFactsResponse {
  upserted: number;
}

export async function persistUserFactsEdge(
  params: PersistUserFactsParams
): Promise<PersistUserFactsResponse> {
  const { data, error } =
    await supabase.functions.invoke<PersistUserFactsResponse>(
      "persist_user_facts",
      {
        method: "POST",
        body: params,
      }
    );

  if (error) {
    console.error("[persistUserFactsEdge] Error:", error);
    throw error;
  }

  return data ?? { upserted: 0 };
}
