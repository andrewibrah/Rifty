import { supabase } from "../lib/supabase";
import type {
  EntrySummary,
  CreateEntrySummaryParams,
  SummarizeEntryResult,
  GoalDetectionResult,
} from "../types/mvp";
import { isUUID } from "../utils/uuid";

interface SummarizeEntryEdgeResponse {
  summary: SummarizeEntryResult;
  stored_summary?: EntrySummary | null;
}

interface SummarizeEntryEdgePayload {
  content: string;
  entryType: string;
  entryId?: string;
  store?: boolean;
}

export interface SummarizeEntryOptions {
  entryId?: string;
  store?: boolean;
}

/**
 * Summarize an entry using OpenAI with structured extraction
 */
export async function summarizeEntry(
  content: string,
  entryType: string,
  options: SummarizeEntryOptions = {}
): Promise<SummarizeEntryResult> {
  const payload: SummarizeEntryEdgePayload = {
    content,
    entryType,
  };

  if (options.entryId) {
    payload.entryId = options.entryId;
  }
  if (options.store !== undefined) {
    payload.store = options.store;
  }

  const { data, error } =
    await supabase.functions.invoke<SummarizeEntryEdgeResponse>(
      "summarize_entry",
      {
        method: "POST",
        body: payload,
      }
    );

  if (error) {
    console.error("[summarizeEntry] Edge function error:", error);
    throw error;
  }

  if (!data?.summary) {
    throw new Error("summarize_entry edge function returned no summary");
  }

  return data.summary;
}

/**
 * Detect if entry implies a goal
 */
export async function detectGoal(
  content: string
): Promise<GoalDetectionResult> {
  const { data, error } = await supabase.functions.invoke<GoalDetectionResult>(
    "detect_goal",
    {
      method: "POST",
      body: { content },
    }
  );

  if (error) {
    if ((error as any)?.status === 401) {
      throw error;
    }
    console.warn("[detectGoal] Edge function error:", error);
    return { goal_detected: false };
  }

  return data ?? { goal_detected: false };
}

/**
 * Store entry summary in database
 */
export async function storeEntrySummary(
  params: CreateEntrySummaryParams
): Promise<EntrySummary> {
  const { data, error } = await supabase.functions.invoke<EntrySummary>(
    "store_entry_summary",
    {
      method: "POST",
      body: params,
    }
  );

  if (error) {
    console.error("[storeEntrySummary] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("store_entry_summary edge function returned no data");
  }

  return data;
}

/**
 * Get entry summary by entry ID
 */
export async function getEntrySummary(
  entryId: string
): Promise<EntrySummary | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  if (!isUUID(entryId)) {
    console.warn(
      "[getEntrySummary] Skipping lookup for invalid entry id",
      entryId
    );
    return null;
  }

  const { data, error } = await supabase
    .from("entry_summaries")
    .select("*")
    .eq("entry_id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getEntrySummary] Error:", error);
    throw error;
  }

  return data as EntrySummary | null;
}

/**
 * Get all summaries for a user
 */
export async function listEntrySummaries(
  options: {
    limit?: number;
    before?: string;
  } = {}
): Promise<EntrySummary[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  const limit = options.limit ?? 50;

  let query = supabase
    .from("entry_summaries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[listEntrySummaries] Error:", error);
    throw error;
  }

  return (data ?? []) as EntrySummary[];
}
