import { supabase } from "@/lib/supabase";

const EDGE_VERSION = "spine.v1" as const;
const AUTH_MISSING_ERROR = "auth_session_missing" as const;

async function ensureAuthSession(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.warn("[riflettSpine] auth session fetch failed", error);
    throw new Error(AUTH_MISSING_ERROR);
  }

  if (!session?.access_token) {
    console.warn("[riflettSpine] auth session missing access token");
    throw new Error(AUTH_MISSING_ERROR);
  }

  return session.access_token;
}

type FeedbackLabel = "helpful" | "unhelpful" | "neutral";

interface FunctionResponse<T> {
  version: string;
  data?: T;
  error?: string;
}

export interface RiflettAiEvent {
  id: string;
  user_id: string;
  intent: string;
  input: string;
  output_json: Record<string, unknown>;
  latency_ms: number | null;
  model: string | null;
  temperature: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface RecordAiEventInput {
  intent: string;
  input: string;
  outputJson: Record<string, unknown>;
  latencyMs?: number | null;
  model?: string | null;
  temperature?: number | null;
  metadata?: Record<string, unknown>;
}

export async function recordAiEvent(
  params: RecordAiEventInput
): Promise<RiflettAiEvent | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    console.warn("[riflettSpine] recordAiEvent skipped; user not available", userError);
    return null;
  }

  const payload = {
    user_id: user.id,
    intent: params.intent,
    input: params.input,
    output_json: params.outputJson,
    latency_ms: params.latencyMs ?? null,
    model: params.model ?? null,
    temperature: params.temperature ?? null,
    metadata: params.metadata ?? {},
  };

  const { data, error } = await supabase
    .from("riflett_ai_event")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.warn("[riflettSpine] recordAiEvent insert failed", error);
    return null;
  }

  return data as RiflettAiEvent;
}

export interface SubmitFeedbackInput {
  aiEventId: string;
  label: FeedbackLabel;
  correction?: string;
  tags?: string[];
  confidenceFromModel?: number;
}

export interface SubmitFeedbackResult {
  feedback: {
    id: string;
    created_at: string;
    label: FeedbackLabel;
    correction: string | null;
    tags: string[] | null;
    confidence_from_model: number | null;
  };
  ai_event: {
    id: string;
    intent: string;
    created_at: string;
  };
}

export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<SubmitFeedbackResult> {
  try {
    await ensureAuthSession();
  } catch (authError) {
    throw authError instanceof Error ? authError : new Error(AUTH_MISSING_ERROR);
  }

  const { data, error } = await supabase.functions.invoke<
    FunctionResponse<SubmitFeedbackResult>
  >("feedback_hook", {
    body: {
      ai_event_id: input.aiEventId,
      label: input.label,
      correction: input.correction,
      tags: input.tags,
      confidence_from_model: input.confidenceFromModel,
    },
  });

  if (error) {
    throw error;
  }

  if (!data || data.version !== EDGE_VERSION) {
    throw new Error("Invalid feedback_hook response version");
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (!data.data) {
    throw new Error("feedback_hook returned empty data");
  }

  return data.data;
}

export interface ContextSnapshot {
  recent_modes: Array<{
    label: string;
    count: number;
    last_seen_at: string;
  }>;
  top_topics: Array<{
    topic: string;
    weight: number;
  }>;
  last_goals: Array<{
    id: string;
    title: string;
    status: string;
    current_step: string | null;
    updated_at: string;
  }>;
  likely_need: string;
  evidence_nodes: Array<{
    id: string;
    type: "entry" | "goal" | "topic" | "mood" | "anchor";
    text: string;
    strength: number;
    trust_weight: number;
    sentiment: number | null;
    sources: string[];
  }>;
}

export async function rebuildContext(
  inputText: string
): Promise<ContextSnapshot> {
  try {
    await ensureAuthSession();
  } catch (authError) {
    throw authError instanceof Error ? authError : new Error(AUTH_MISSING_ERROR);
  }

  const { data, error } = await supabase.functions.invoke<
    FunctionResponse<ContextSnapshot>
  >("context_rebuilder", {
    body: { input_text: inputText },
  });

  if (error) {
    throw error;
  }

  if (!data || data.version !== EDGE_VERSION) {
    throw new Error("Invalid context_rebuilder response version");
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (!data.data) {
    throw new Error("context_rebuilder returned empty data");
  }

  return data.data;
}

export interface FailureTrackerInput {
  aiEventId?: string;
  failure_type: FailureType;
  signal: string;
  metadata?: Record<string, unknown>;
  severity?: "low" | "medium" | "high";
}

type FailureType =
  | "wrong_intent"
  | "bad_data"
  | "poor_reasoning"
  | "confused_context"
  | "other";

export interface FailureTrackerResult {
  failure: {
    id: string;
    created_at: string;
    failure_type: FailureType;
    ai_event_id: string | null;
  };
  lesson: {
    id: string;
    lesson_text: string;
    scope: "intent" | "routing" | "style" | "safety";
    created_at: string;
  };
  recent_lessons: Array<{
    id: string;
    lesson_text: string;
    scope: "intent" | "routing" | "style" | "safety";
    created_at: string;
  }>;
}

export async function trackFailure(
  input: FailureTrackerInput
): Promise<FailureTrackerResult> {
  try {
    await ensureAuthSession();
  } catch (authError) {
    throw authError instanceof Error ? authError : new Error(AUTH_MISSING_ERROR);
  }

  const { data, error } = await supabase.functions.invoke<
    FunctionResponse<FailureTrackerResult>
  >("failure_tracker", {
    body: {
      ai_event_id: input.aiEventId,
      failure_type: input.failure_type,
      signal: input.signal,
      metadata: input.metadata,
      severity: input.severity,
    },
  });

  if (error) {
    throw error;
  }

  if (!data || data.version !== EDGE_VERSION) {
    throw new Error("Invalid failure_tracker response version");
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (!data.data) {
    throw new Error("failure_tracker returned empty data");
  }

  return data.data;
}

export async function refreshFeedbackStats(): Promise<void> {
  try {
    await ensureAuthSession();
  } catch (authError) {
    throw authError instanceof Error ? authError : new Error(AUTH_MISSING_ERROR);
  }

  const { error } = await supabase.rpc("refresh_riflett_feedback_stats");

  if (error) {
    throw error;
  }
}

export const riflettAuthErrors = {
  AUTH_MISSING_ERROR,
} as const;
