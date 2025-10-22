import type { GoalContextItem } from '@/types/goal';

export interface RoutedIntent {
  label: string;
  rawLabel: string;
  confidence: number;
  secondBest?: string | null;
  secondConfidence?: number | null;
  slots: Record<string, string>;
  topK: { label: string; confidence: number }[];
  modelVersion?: string;
  matchedTokens?: { label: string; tokens: string[] }[];
  tokens?: string[];
}

export type RouteDecision =
  | {
      kind: 'commit';
      primary: string;
      maybeSecondary?: string | null;
    }
  | { kind: 'clarify'; question: string }
  | { kind: 'fallback' };

export type RouteDecisionKind = RouteDecision['kind'];

export interface PlannerResponse {
  action: string;
  ask: string | null;
  payload: Record<string, unknown>;
}

export interface EnrichedPayload {
  userText: string;
  intent: RoutedIntent;
  contextSnippets: string[];
  userConfig: Record<string, unknown>;
  goalContext?: GoalContextItem[];
  coachingSuggestion?: { type: string; message: string; priority: string; context?: string };  classification?: {
    id: string;
    label: string;
    confidence: number;
    reasons: string[];
    targetEntryId?: string | null;
    targetEntryType?: string | null;
    duplicateMatch?: {
      id: string;
      score: number;
      text: string;
      kind: string;
    } | null;
    topCandidates: { label: string; confidence: number }[];
  };
}

export interface RedactionResult {
  masked: string;
  replacementMap: Record<string, string>;
}
