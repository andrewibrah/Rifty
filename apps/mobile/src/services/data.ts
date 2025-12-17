import type { EntryType as SharedEntryType } from "@shared/types/entries";

import { supabase } from "../lib/supabase";

type Nullable<T> = T | null;

export type MessageRole = "system" | "user" | "assistant";

export type RemoteMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  metadata: Nullable<Record<string, any>>;
  created_at: string;
  updated_at?: string;
};

export type EntryType = SharedEntryType;

export type RemoteJournalEntry = {
  id: string;
  user_id: string;
  type: EntryType;
  content: string;
  metadata: Nullable<Record<string, any>>;
  created_at: string;
  updated_at?: string;
  ai_intent?: Nullable<string>;
  ai_confidence?: Nullable<number>;
  ai_meta?: Nullable<Record<string, any>>;
  source?: Nullable<string>;
  mood?: Nullable<string>;
  feeling_tags?: string[];
  linked_moments?: string[];
};

const EDGE_FUNCTIONS = {
  listMessages: "list_messages",
  appendMessage: "append_message",
  fetchLatestAssistantMessages: "fetch_latest_assistant_messages",
  listJournals: "list_journals",
  createJournalEntry: "create_journal_entry",
  updateJournalEntry: "update_journal_entry",
  deleteJournalEntry: "delete_journal_entry",
  logIntentAudit: "log_intent_audit",
  getJournalEntryById: "get_journal_entry_by_id",
} as const;

type EdgeFunctionName =
  (typeof EDGE_FUNCTIONS)[keyof typeof EDGE_FUNCTIONS];

interface InvokeEdgeFunctionOptions {
  allowNull?: boolean;
}

async function invokeEdgeFunction<T>(
  functionName: EdgeFunctionName,
  body: Record<string, unknown>,
  options: InvokeEdgeFunctionOptions = {}
): Promise<T> {
  const { allowNull = false } = options;
  const { data, error } = await supabase.functions.invoke<T>(
    functionName,
    {
      method: "POST",
      body,
    }
  );

  if (error) {
    console.error(`[${functionName}] Edge function error:`, error);
    throw error;
  }

  if ((data === null || data === undefined) && !allowNull) {
    throw new Error(`${functionName} edge function returned no data`);
  }

  return data as T;
}

export async function listMessages(
  conversationId: string,
  options: { limit?: number; before?: string } = {}
): Promise<RemoteMessage[]> {
  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
  };

  if (options.limit !== undefined) {
    payload.limit = options.limit;
  }

  if (options.before) {
    payload.before = options.before;
  }

  const messages = await invokeEdgeFunction<RemoteMessage[]>(
    EDGE_FUNCTIONS.listMessages,
    payload
  );

  return messages ?? [];
}

export async function appendMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  metadata?: Record<string, any>
): Promise<RemoteMessage> {
  return invokeEdgeFunction<RemoteMessage>(
    EDGE_FUNCTIONS.appendMessage,
    {
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata ?? null,
    }
  );
}

export async function fetchLatestAssistantMessages(
  conversationIds: string[]
): Promise<Record<string, RemoteMessage | null>> {
  if (conversationIds.length === 0) {
    return {};
  }

  const assistantMap =
    await invokeEdgeFunction<Record<string, RemoteMessage | null>>(
      EDGE_FUNCTIONS.fetchLatestAssistantMessages,
      { conversation_ids: conversationIds }
    );

  return assistantMap ?? {};
}

export async function listJournals(
  options: { limit?: number; before?: string; type?: EntryType } = {}
): Promise<RemoteJournalEntry[]> {
  const payload: Record<string, unknown> = {};

  if (options.limit !== undefined) {
    payload.limit = options.limit;
  }

  if (options.before) {
    payload.before = options.before;
  }

  if (options.type) {
    payload.type = options.type;
  }

  const entries = await invokeEdgeFunction<RemoteJournalEntry[]>(
    EDGE_FUNCTIONS.listJournals,
    payload
  );

  return entries ?? [];
}

export async function createJournalEntry(params: {
  type: EntryType;
  content: string;
  metadata?: Record<string, any>;
  mood?: string | null;
  feeling_tags?: string[];
}): Promise<RemoteJournalEntry> {
  return invokeEdgeFunction<RemoteJournalEntry>(
    EDGE_FUNCTIONS.createJournalEntry,
    {
      type: params.type,
      content: params.content,
      metadata: params.metadata ?? null,
      mood: params.mood ?? null,
      feeling_tags: params.feeling_tags ?? [],
    }
  );
}

export async function updateJournalEntry(
  entryId: string,
  updates: {
    content?: string;
    metadata?: Record<string, any> | null;
    mood?: string | null;
    feeling_tags?: string[];
    linked_moments?: string[];
  }
): Promise<RemoteJournalEntry> {
  return invokeEdgeFunction<RemoteJournalEntry>(
    EDGE_FUNCTIONS.updateJournalEntry,
    {
      entry_id: entryId,
      ...updates,
    }
  );
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await invokeEdgeFunction(
    EDGE_FUNCTIONS.deleteJournalEntry,
    { entry_id: id },
    { allowNull: true }
  );
}

interface DeleteAllEntriesResponse {
  deleted_count: number;
  deleted_at: string;
}

export async function deleteAllJournalEntries(): Promise<void> {
  const { data, error } =
    await supabase.functions.invoke<DeleteAllEntriesResponse>(
      "delete_all_entries",
      {
        method: "POST",
        body: {},
      }
    );

  if (error) {
    console.error("[deleteAllJournalEntries] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("delete_all_entries edge function returned no data");
  }

  console.log(
    `[deleteAllJournalEntries] Deleted ${data.deleted_count} entries`
  );
}

interface DeleteEntriesByTypeResponse {
  deleted_count: number;
  deleted_at: string;
  type: EntryType;
}

export async function deleteAllEntriesByType(type: EntryType): Promise<void> {
  const { data, error } =
    await supabase.functions.invoke<DeleteEntriesByTypeResponse>(
      "delete_entries_by_type",
      {
        method: "POST",
        body: { type },
      }
    );

  if (error) {
    console.error("[deleteAllEntriesByType] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("delete_entries_by_type edge function returned no data");
  }

  console.log(
    `[deleteAllEntriesByType] Deleted ${data.deleted_count} ${type} entries`
  );
}

export async function logIntentAudit(params: {
  entryId: string;
  prompt: string;
  predictedIntent: string;
  correctIntent: string;
}): Promise<void> {
  await invokeEdgeFunction(
    EDGE_FUNCTIONS.logIntentAudit,
    {
      entry_id: params.entryId,
      prompt: params.prompt,
      predicted_intent: params.predictedIntent,
      correct_intent: params.correctIntent,
    },
    { allowNull: true }
  );
}

export async function getJournalEntryById(
  id: string
): Promise<RemoteJournalEntry | null> {
  const entry = await invokeEdgeFunction<RemoteJournalEntry | null>(
    EDGE_FUNCTIONS.getJournalEntryById,
    { entry_id: id },
    { allowNull: true }
  );

  return entry ?? null;
}
