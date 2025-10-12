import { supabase } from "./supabase";
import type { EntryType } from "../services/data";
import type {
  EntryNotePayload,
  IntentPredictionResult,
  ProcessingStep,
} from "../types/intent";
import type { NativeIntentResult } from "../native/intent";
import type { EnrichedPayload, RouteDecision, RedactionResult, PlannerResponse } from "@/agent/types";
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
