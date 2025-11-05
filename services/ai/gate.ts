import { complexity_score } from './pipeline';

// Define intent types
export type IntentType = 'small_talk' | 'scheduling' | 'tag' | 'reflection' | 'analysis' | 'planning' | 'unknown';

export interface GateResult {
  route: 'fast_path' | 'gpt_thinking';
  confidence: number;
  intent: IntentType;
  reason: string;
}

// Simple heuristic-based intent classifier (placeholder for small model)
function classifyIntentHeuristic(userMessage: string): { intent: IntentType; confidence: number } {
  const lower = userMessage.toLowerCase();
  
  // Small talk patterns
  if (lower.match(/\b(hi|hello|hey|how are you|what's up|good morning|good evening)\b/)) {
    return { intent: 'small_talk', confidence: 0.9 };
  }
  
  // Scheduling patterns
  if (lower.match(/\b(schedule|calendar|remind|meeting|appointment|plan|todo|task)\b/)) {
    return { intent: 'scheduling', confidence: 0.85 };
  }
  
  // Tag patterns
  if (lower.match(/\b(tag|label|categorize|organize|sort)\b/)) {
    return { intent: 'tag', confidence: 0.8 };
  }
  
  // Complex patterns
  if (lower.match(/\b(analyze|reflect|understand|why|how|deep|insight)\b/)) {
    return { intent: 'reflection', confidence: 0.7 };
  }
  
  // Default to unknown
  return { intent: 'unknown', confidence: 0.3 };
}

// Main gating function
export async function gateRequest(input: {
  userMessage: string;
  context?: any;
}): Promise<GateResult> {
  try {
    // Try small model classification (placeholder - would be CoreML/HF)
    const { intent, confidence } = classifyIntentHeuristic(input.userMessage);
    
    // Check if should route to fast path
    const fastPathIntents: IntentType[] = ['small_talk', 'scheduling', 'tag'];
    const shouldFastPath = confidence > 0.8 && fastPathIntents.includes(intent);
    
    const route = shouldFastPath ? 'fast_path' : 'gpt_thinking';
    const reason = shouldFastPath 
      ? `High confidence ${intent} (${confidence.toFixed(2)}) - using fast path`
      : `Low confidence or complex intent (${intent}: ${confidence.toFixed(2)}) - escalating to GPT`;
    
    // Log decision (would go to logging system)
    console.log(`[GATE] ${route}: ${reason}`);
    
    return {
      route,
      confidence,
      intent,
      reason,
    };
    
  } catch (error) {
    // Fallback heuristics if small model fails
    console.warn('[GATE] Small model failed, using fallback heuristics');
    
    const complexity = complexity_score({ userMessage: input.userMessage });
    const route = complexity < 0.5 ? 'fast_path' : 'gpt_thinking';
    const reason = `Fallback: complexity ${complexity.toFixed(2)} -> ${route}`;
    
    return {
      route,
      confidence: 0.5,
      intent: 'unknown',
      reason,
    };
  }
}

// Fast path response generator (simple rule-based)
export function generateFastPathResponse(gateResult: GateResult, input: { userMessage: string }): string {
  const lower = input.userMessage.toLowerCase();
  
  switch (gateResult.intent) {
    case 'small_talk':
      if (lower.includes('how are you')) {
        return "I'm doing well, thank you! How can I help you today?";
      }
      return "Hello! Nice to hear from you. What would you like to work on?";
      
    case 'scheduling':
      return "I'd be happy to help you with scheduling. What would you like to plan?";
      
    case 'tag':
      return "Let's organize that. What tags would you like to use?";
      
    default:
      return "I understand you have something to discuss. How can I assist?";
  }
}
