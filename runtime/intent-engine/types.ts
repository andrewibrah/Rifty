export type IntentLabelId =
  | 'conversational'
  | 'entry_create'
  | 'entry_discuss'
  | 'entry_append'
  | 'command'
  | 'search_query';

export interface IntentLabelDefinition {
  id: IntentLabelId;
  display: string;
  subsystem: 'entries' | 'user_config' | 'knowledge';
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
