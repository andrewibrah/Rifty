import { supabase } from "./supabase";
import type { EntryType } from "../services/data";
import Constants from "expo-constants";
import type {
  EntryNotePayload,
  IntentPredictionResult,
  ProcessingStep,
} from "../types/intent";
import type { NativeIntentResult } from "../native/intent";
import type {
  EnrichedPayload,
  RouteDecision,
  RedactionResult,
  PlannerResponse,
} from "@/agent/types";
import type { MemoryRecord } from "@/agent/memory";

export interface ClassifiedEntry {
  id: string;
  user_id: string;
  type: EntryType;
  content: string;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at?: string;
  ai_intent: string | null;
  ai_confidence: number | null;
  ai_meta: Record<string, any> | null;
  source: string | null;
}

export interface CreateEntryFromChatArgs {
  content: string;
  entryType: EntryType;
  intent: IntentPredictionResult;
  note: EntryNotePayload | null;
  processingTimeline: ProcessingStep[];
  nativeIntent?: NativeIntentResult | null;
  enriched?: EnrichedPayload;
  decision?: RouteDecision;
  redaction?: RedactionResult;
  memoryMatches?: MemoryRecord[];
  plan?: PlannerResponse | null;
}

const SOURCE_TAG = "ai";

async function getSupabaseUrl(): Promise<string> {
  return supabase.supabaseUrl;
}

async function getAnonKey(): Promise<string> {
  // Get the anon key from the same source as supabase client initialization
  const extra = ((Constants.expoConfig?.extra as
    | Record<string, unknown>
    | undefined) ??
    (Constants.manifest2 as { extra?: Record<string, unknown> } | null)
      ?.extra ??
    {}) as Record<string, unknown>;

  const pickEnvValue = (...values: Array<unknown>): string | undefined => {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  };

  const configuredKey = pickEnvValue(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    extra.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    extra.SUPABASE_ANON_KEY
  );

  return configuredKey || "anon-key";
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  const accessToken = data.session?.access_token ?? null;
  if (!accessToken) {
    throw new Error("No active session");
  }
  return accessToken;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) {
      return body.error;
    }
    return "Request failed";
  } catch (_error) {
    return "Request failed";
  }
}

export interface ProcessedEntryResult {
  entry: ClassifiedEntry;
  summary: any | null;
  embedding_stored: boolean;
  goal_detected: boolean;
  goal: any | null;
  reflection: string;
}

export async function createEntryFromChat(
  args: CreateEntryFromChatArgs
): Promise<ClassifiedEntry> {
  const trimmedContent = args.content.trim();
  if (!trimmedContent) {
    throw new Error("Content is required");
  }

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  const userId = userResult.user?.id;
  if (!userId) {
    throw new Error("No active session");
  }

  const metadata = {
    subsystem: args.intent.subsystem,
    searchTag: args.note?.searchTag ?? null,
    noteDraft: args.note,
    nativeIntent: args.nativeIntent ?? null,
    routing: args.decision ?? null,
    slots: args.enriched?.intent.slots ?? {},
    memoryMatches: args.memoryMatches ?? [],
    redaction: args.redaction?.replacementMap ?? {},
    plan: args.plan ?? null,
  };

  const aiMeta = {
    intent: {
      id: args.intent.id,
      rawLabel: args.intent.rawLabel,
      label: args.intent.label,
      confidence: args.intent.confidence,
      subsystem: args.intent.subsystem,
      probabilities: args.intent.probabilities,
    },
    note: args.note,
    processingTimeline: args.processingTimeline,
    nativeIntent: args.nativeIntent ?? null,
    routing: args.decision ?? null,
    enriched: args.enriched ?? null,
    memoryMatches: args.memoryMatches ?? [],
    redaction: args.redaction?.replacementMap ?? {},
    plan: args.plan ?? null,
  };

  const { data, error } = await supabase
    .from("entries")
    .insert({
      user_id: userId,
      type: args.entryType,
      content: trimmedContent,
      metadata,
      ai_intent: args.intent.id,
      ai_confidence: args.intent.confidence,
      ai_meta: aiMeta,
      source: SOURCE_TAG,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as ClassifiedEntry;
}

/**
 * Create entry using MVP enhanced flow (summarization + embeddings + goal detection)
 */
export async function createEntryMVP(
  content: string
): Promise<ProcessedEntryResult> {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("Content is required");
  }

  const [url, anonKey, accessToken] = await Promise.all([
    Promise.resolve(getSupabaseUrl()),
    Promise.resolve(getAnonKey()),
    getAccessToken(),
  ]);

  const response = await fetch(`${url}/functions/v1/process_entry_mvp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ content: trimmedContent }),
  });

  if (!response.ok) {
    const message = await parseError(response);
    console.error("[createEntryMVP] Request failed", {
      status: response.status,
      statusText: response.statusText,
      url: `${url}/functions/v1/process_entry_mvp`,
      message,
    });
    throw new Error(`Entry creation failed: ${message} (${response.status})`);
  }

  const data = (await response.json()) as ProcessedEntryResult;
  return data;
}
