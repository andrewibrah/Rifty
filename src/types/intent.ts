import type {
  AppIntent,
  IntentDefinition,
  IntentSubsystem,
} from "../constants/intents";

export type ProcessingStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped";

export type ProcessingStepId =
  | "ml_detection"
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
