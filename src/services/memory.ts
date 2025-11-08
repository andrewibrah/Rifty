// @ts-nocheck
import { supabase } from "../lib/supabase";
import { debugIfTableMissing } from "../utils/supabaseErrors";
import type {
  UserFact,
  CreateUserFactParams,
  AnalystQueryResult,
} from "../types/mvp";
import type { ReflectionCadence } from "../types/personalization";
import {
  getOperatingPicture as invokeOperatingPicture,
  ragSearch as invokeRagSearch,
  askAnalyst,
  persistUserFactsEdge,
} from "./edgeFunctions";

type RagKind = "entry" | "goal" | "schedule";

type RagScopeInput = RagKind | RagKind[] | "all";

type SafeQueryResult<T> = {
  data: T | null;
  error: unknown | null;
};

type QueryExecutor<T> =
  | (() => Promise<
      SafeQueryResult<T> | { data: T | null; error: unknown | null }
    >)
  | PromiseLike<SafeQueryResult<T> | { data: T | null; error: unknown | null }>;

export interface OperatingGoal {
  id: string;
  title: string;
  status: string;
  priority_score: number;
  target_date: string | null;
  current_step: string | null;
  micro_steps: string[];
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface OperatingEntry {
  id: string;
  type: string;
  summary: string;
  created_at: string;
  emotion?: string | null;
  urgency_level?: number | null;
  snippet: string;
  metadata: Record<string, unknown>;
}

export interface OperatingSchedule {
  id: string;
  intent: string | null;
  summary: string | null;
  start_at: string;
  end_at: string;
  goal_id: string | null;
  location: string | null;
  attendees: string[];
  receipts: Record<string, unknown>;
}

export interface CadenceProfile {
  cadence: ReflectionCadence;
  session_length_minutes: number;
  last_message_at: string | null;
  missed_day_count: number;
  current_streak: number;
  timezone: string;
}

export interface OperatingPicture {
  why_model: Record<string, unknown> | null;
  top_goals: OperatingGoal[];
  hot_entries: OperatingEntry[];
  next_72h: OperatingSchedule[];
  cadence_profile: CadenceProfile;
  risk_flags: string[];
}

export interface RagResult {
  id: string;
  kind: RagKind;
  score: number;
  title?: string;
  snippet: string;
  metadata: Record<string, unknown>;
}

export interface PersistedFactInput {
  key: string;
  value: unknown;
  confidence?: number;
  tags?: string[];
  source?: string;
}

const safeQuery = async <T>(
  executor: QueryExecutor<T>
): Promise<SafeQueryResult<T>> => {
  try {
    const result =
      typeof executor === "function" ? await executor() : await executor;
    const data = (result?.data ?? null) as T | null;
    const error = result?.error ?? null;
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

const nowIso = () => new Date().toISOString();

const resolveUserId = async (uid?: string): Promise<string | null> => {
  if (uid) return uid;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.warn("[memory] resolveUserId failed", error);
    return null;
  }
  return user?.id ?? null;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : null))
    .filter((item): item is string => item !== null);
};

const asMetadata = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapOperatingGoals = (rows: unknown[]): OperatingGoal[] =>
  rows
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const goal = raw as Record<string, unknown>;
      return {
        id: String(goal.id ?? ""),
        title: String(goal.title ?? "Untitled goal"),
        status: String(goal.status ?? "active"),
        priority_score: Number(goal.priority_score ?? 0),
        target_date:
          typeof goal.target_date === "string" ? goal.target_date : null,
        current_step:
          typeof goal.current_step === "string" ? goal.current_step : null,
        micro_steps: asStringArray(goal.micro_steps),
        metadata: asMetadata(goal.metadata),
        updated_at: String(goal.updated_at ?? nowIso()),
      };
    })
    .filter((goal): goal is OperatingGoal => Boolean(goal?.id));

const mapOperatingEntries = (rows: unknown[]): OperatingEntry[] =>
  rows
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const entry = raw as Record<string, unknown>;
      const content = typeof entry.content === "string" ? entry.content : "";
      const snippet = content.slice(0, 220);
      return {
        id: String(entry.id ?? ""),
        type: String(entry.type ?? "journal"),
        summary: typeof entry.summary === "string" ? entry.summary : snippet,
        created_at: String(entry.created_at ?? nowIso()),
        emotion: typeof entry.emotion === "string" ? entry.emotion : null,
        urgency_level:
          typeof entry.urgency_level === "number" ? entry.urgency_level : null,
        snippet,
        metadata: asMetadata(entry.metadata),
      };
    })
    .filter((entry): entry is OperatingEntry => Boolean(entry?.id));

type RawSchedule = {
  id?: unknown;
  intent?: unknown;
  summary?: unknown;
  start_at?: unknown;
  end_at?: unknown;
  goal_id?: unknown;
  location?: unknown;
  attendees?: unknown;
  receipts?: unknown;
};

const mapOperatingSchedules = (rows: unknown[]): OperatingSchedule[] =>
  rows
    .map((raw) => {
      const rowData = raw as RawSchedule;
      const attendees = Array.isArray(rowData.attendees)
        ? rowData.attendees.filter(
            (item): item is string => typeof item === "string"
          )
        : [];
      return {
        id: String(rowData.id ?? ""),
        intent: typeof rowData.intent === "string" ? rowData.intent : null,
        summary: typeof rowData.summary === "string" ? rowData.summary : null,
        start_at: String(rowData.start_at ?? nowIso()),
        end_at: String(rowData.end_at ?? rowData.start_at ?? nowIso()),
        goal_id: typeof rowData.goal_id === "string" ? rowData.goal_id : null,
        location:
          typeof rowData.location === "string" ? rowData.location : null,
        attendees,
        receipts: asMetadata(rowData.receipts),
      };
    })
    .filter((row): row is OperatingSchedule => Boolean(row?.id));

export async function getOperatingPicture(
  uid?: string
): Promise<OperatingPicture> {
  const userId = await resolveUserId(uid);
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const payload = await invokeOperatingPicture();
  const cadenceRaw = (payload?.cadence_profile ?? {}) as Record<
    string,
    unknown
  >;

  const cadence: CadenceProfile = {
    cadence: (typeof cadenceRaw.cadence === "string"
      ? cadenceRaw.cadence
      : "none") as ReflectionCadence,
    session_length_minutes:
      Number(cadenceRaw.session_length_minutes ?? 25) || 25,
    last_message_at:
      typeof cadenceRaw.last_message_at === "string"
        ? cadenceRaw.last_message_at
        : null,
    missed_day_count: Number(cadenceRaw.missed_day_count ?? 0) || 0,
    current_streak: Number(cadenceRaw.current_streak ?? 0) || 0,
    timezone:
      typeof cadenceRaw.timezone === "string" ? cadenceRaw.timezone : "UTC",
  };

  const riskFlags = Array.isArray(payload?.risk_flags)
    ? payload.risk_flags.filter(
        (flag): flag is string => typeof flag === "string"
      )
    : [];

  const goals = Array.isArray(payload?.top_goals)
    ? mapOperatingGoals(payload.top_goals)
    : [];

  const entries = Array.isArray(payload?.hot_entries)
    ? mapOperatingEntries(payload.hot_entries)
    : [];

  const schedules = Array.isArray(payload?.next_72h)
    ? mapOperatingSchedules(payload.next_72h)
    : [];

  return {
    why_model: (payload?.why_model ?? null) as Record<string, unknown> | null,
    top_goals: goals,
    hot_entries: entries,
    next_72h: schedules,
    cadence_profile: cadence,
    risk_flags: riskFlags,
  };
}

export async function ragSearch(
  uid: string,
  query: string,
  scope: RagScopeInput = "all",
  options: { limit?: number } = {}
): Promise<RagResult[]> {
  const userId = await resolveUserId(uid);
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const response = await invokeRagSearch({
    query: trimmed,
    scope,
    limit: options.limit,
  });

  return (response?.results ?? []).map((item) => ({
    id: String(item.id ?? ""),
    kind: item.kind as RagKind,
    score: Number(item.score ?? 0),
    title: item.title,
    snippet: String(item.snippet ?? ""),
    metadata: item.metadata ?? {},
  }));
}

export async function persistUserFacts(
  uid: string | null,
  facts: PersistedFactInput[]
): Promise<void> {
  if (!Array.isArray(facts) || facts.length === 0) {
    return;
  }

  const userId = await resolveUserId(uid ?? undefined);
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const normalizedFacts = facts
    .filter((fact) => fact && typeof fact.key === "string" && fact.key.trim())
    .map((fact) => ({
      key: fact.key.trim(),
      value: fact.value ?? null,
      confidence: fact.confidence,
      tags: Array.isArray(fact.tags)
        ? fact.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      source: typeof fact.source === "string" ? fact.source : undefined,
    }));

  if (!normalizedFacts.length) {
    return;
  }

  await persistUserFactsEdge({ facts: normalizedFacts, user_id: userId });
}

export async function answerAnalystQuery(
  query: string
): Promise<AnalystQueryResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Query is required");
  }
  return askAnalyst({ query: trimmed });
}

export async function createUserFact(
  params: CreateUserFactParams
): Promise<UserFact> {
  const { data, error } = await supabase.functions.invoke<UserFact>(
    "create_user_fact",
    {
      method: "POST",
      body: {
        fact: params.fact,
        category: params.category,
        confidence: params.confidence,
        source_entry_ids: params.source_entry_ids,
      },
    }
  );

  if (error) {
    console.error("[createUserFact] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("create_user_fact edge function returned no data");
  }

  return data;
}

export async function listUserFacts(
  options: { limit?: number; category?: string } = {}
): Promise<UserFact[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  const limit = options.limit ?? 50;

  let query = supabase
    .from("user_facts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.category) {
    query = query.eq("category", options.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[listUserFacts] Error:", error);
    throw error;
  }

  return (data ?? []) as UserFact[];
}

export async function updateUserFact(
  factId: string,
  updates: { fact?: string; confidence?: number; last_confirmed_at?: string }
): Promise<UserFact> {
  const { data, error } = await supabase.functions.invoke<UserFact>(
    "update_user_fact",
    {
      method: "POST",
      body: {
        fact_id: factId,
        ...updates,
      },
    }
  );

  if (error) {
    console.error("[updateUserFact] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("update_user_fact edge function returned no data");
  }

  return data;
}

interface DeleteUserFactResponse {
  deleted_id: string;
  deleted_at: string;
}

export async function deleteUserFact(factId: string): Promise<void> {
  const { data, error } =
    await supabase.functions.invoke<DeleteUserFactResponse>(
      "delete_user_fact",
      {
        method: "POST",
        body: {
          fact_id: factId,
        },
      }
    );

  if (error) {
    console.error("[deleteUserFact] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("delete_user_fact edge function returned no data");
  }
}
