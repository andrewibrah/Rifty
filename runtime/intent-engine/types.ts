export type IntentLabelId =
  | 'journal_entry'
  | 'goal_create'
  | 'goal_check_in'
  | 'schedule_create'
  | 'reminder_set'
  | 'reflection_request'
  | 'settings_change'
  | 'insight_link';

export interface IntentLabelDefinition {
  id: IntentLabelId;
  display: string;
  subsystem: 'entries' | 'goals' | 'schedule' | 'user_config' | 'knowledge';
}

export interface RuntimeIntentModel {
  version: string;
  createdAt: string;
  description: string;
  labels: IntentLabelDefinition[];
  logPriors: Record<IntentLabelId, number>;
  tokenLogLikelihoods: Record<IntentLabelId, Record<string, number>>;
  unseenTokenPenalty: number;
  vocabularySize: number;
  alpha: number;
  topFeatures: Record<IntentLabelId, string[]>;
}

export interface RuntimeIntentCandidate {
  id: IntentLabelId;
  label: string;
  confidence: number;
  logScore: number;
  matchedTokens: string[];
}

export interface RuntimeIntentResult {
  primary: RuntimeIntentCandidate;
  topK: RuntimeIntentCandidate[];
  modelVersion: string;
  inferenceMs: number;
  tokens: string[];
}
