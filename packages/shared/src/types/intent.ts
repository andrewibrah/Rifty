import type { EntryType } from "./entries";

export type RawIntentLabel =
  | "Conversational"
  | "Entry Create"
  | "Entry Discuss"
  | "Entry Append"
  | "Command"
  | "Search Query"
  | "label"
  | string;

export type AppIntent =
  | "conversational"
  | "entry_create"
  | "entry_discuss"
  | "entry_append"
  | "command"
  | "search_query"
  | "unknown";

export type IntentSubsystem =
  | "entries"
  | "goals"
  | "schedule"
  | "user_config"
  | "support"
  | "knowledge";

export interface IntentDefinition {
  id: AppIntent;
  label: RawIntentLabel;
  subsystem: IntentSubsystem;
  entryType?: EntryType;
  allowedInEntryChat: boolean;
}

export type ProcessingStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped";

export type ProcessingStepId =
  | "knowledge_search"
  | "openai_request"
  | "openai_response";

export interface ProcessingStep {
  id: ProcessingStepId;
  label: string;
  status: ProcessingStatus;
  detail?: string;
  timestamp?: string;
}

export interface IntentPredictionResult extends IntentDefinition {
  rawLabel: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface IntentMetadata {
  id: AppIntent;
  rawLabel: string;
  displayLabel: string;
  confidence: number;
  subsystem: IntentSubsystem;
  probabilities: Record<string, number>;
}

export interface EntryNotePayload {
  noteTitle: string;
  noteBody: string;
  searchTag: string;
  guidance: string;
}
