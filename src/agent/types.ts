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
}

export interface RedactionResult {
  masked: string;
  replacementMap: Record<string, string>;
}
