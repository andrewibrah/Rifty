export interface NativeIntentResult {
  label: string;
  confidence: number;
  top3: { label: string; confidence: number }[];
  topK: { label: string; confidence: number }[];
  modelVersion?: string;
  matchedTokens?: { label: string; tokens: string[] }[];
  tokens?: string[];
}

export const DEFAULT_NATIVE_RESULT: NativeIntentResult = {
  label: "Conversational",
  confidence: 0.6,
  top3: [
    { label: "Conversational", confidence: 0.6 },
    { label: "Entry Create", confidence: 0.3 },
    { label: "Search Query", confidence: 0.2 },
  ],
  topK: [
    { label: "Conversational", confidence: 0.6 },
    { label: "Entry Create", confidence: 0.3 },
    { label: "Search Query", confidence: 0.2 },
  ],
  modelVersion: "openai-routing",
  matchedTokens: [],
  tokens: [],
};
