import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import type { EntryType } from "../services/data";
import { isGoalsV2Enabled } from "../utils/flags";
import type { Goal } from "../types/goal";
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
import { createEntryFromChatEdge } from "../services/edgeFunctions";

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
  mood?: string | null;
  feeling_tags?: string[];
  linked_moments?: string[];
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
  return SUPABASE_URL;
}

async function getAnonKey(): Promise<string> {
  return SUPABASE_ANON_KEY;
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
  goal: Goal | null;
  reflection: string;
}

export async function createEntryFromChat(
  args: CreateEntryFromChatArgs
): Promise<ClassifiedEntry> {
  const entry = await createEntryFromChatEdge({
    content: args.content,
    entryType: args.entryType,
    intent: args.intent,
    note: args.note ?? undefined,
    processingTimeline: args.processingTimeline,
    nativeIntent: args.nativeIntent ?? undefined,
    enriched: args.enriched ?? undefined,
    decision: args.decision ?? undefined,
    redaction: args.redaction ?? undefined,
    memoryMatches: args.memoryMatches ?? undefined,
    plan: args.plan ?? undefined,
    goalsV2Enabled: isGoalsV2Enabled(),
  });

  return entry;
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

  if (isGoalsV2Enabled()) {
    supabase.functions
      .invoke("link_reflections", {
        body: { entry_id: data.entry.id },
      })
      .catch((error) => {
        console.warn("[createEntryMVP] link_reflections invoke failed", error);
      });
  }

  return data;
}
