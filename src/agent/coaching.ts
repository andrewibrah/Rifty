import type { OperatingPicture, RagResult } from '@/services/memory';
import type { PersonalizationRuntime } from '@/types/personalization';

export interface CoachingSuggestion {
  type: 'motivation' | 'reflection' | 'action' | 'gratitude' | 'goal_check';
  message: string;
  priority: 'low' | 'medium' | 'high';
  context?: string;
}

const DEPRESSION_INDICATORS = ['sad', 'depressed', 'anxious', 'overwhelmed', 'lonely', 'hopeless'];
const POSITIVE_PATTERNS = ['grateful', 'accomplished', 'happy', 'progress', 'motivated'];
const GOAL_STUCK_INDICATORS = ['stuck', 'blocked', 'frustrated', 'struggling'];

export function assessUserState(
  text: string,
  operatingPicture: OperatingPicture,
  config: PersonalizationRuntime
): { mood: 'positive' | 'neutral' | 'negative'; needsCoaching: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let mood: 'positive' | 'neutral' | 'negative' = 'neutral';
  let needsCoaching = false;

  // Analyze current text
  const lowerText = text.toLowerCase();
  const hasNegative = DEPRESSION_INDICATORS.some(word => lowerText.includes(word));
  const hasPositive = POSITIVE_PATTERNS.some(word => lowerText.includes(word));

  if (hasNegative) {
    mood = 'negative';
    reasons.push('negative language detected');
    needsCoaching = true;
  } else if (hasPositive) {
    mood = 'positive';
    reasons.push('positive language detected');
  }

  // Analyze streaks and goals
  if (operatingPicture.cadence_profile.missed_day_count > 3) {
    reasons.push('missed reflection days');
    needsCoaching = true;
  }

  if (operatingPicture.top_goals.length === 0) {
    reasons.push('no active goals');
    needsCoaching = true;
  }

  const stuckGoals = operatingPicture.top_goals.filter(g => GOAL_STUCK_INDICATORS.some(word => lowerText.includes(word)));
  if (stuckGoals.length > 0) {
    reasons.push('goals feeling stuck');
    needsCoaching = true;
  }

  const activeGoals = operatingPicture.top_goals.filter(g => g.status === 'active');
  if (activeGoals.length > 0 && config.cadence === 'none') {
    reasons.push('has goals but no reflection cadence');
    needsCoaching = true;
  }

  // Check risk flags
  if (operatingPicture.risk_flags.includes('high_stress') || operatingPicture.risk_flags.includes('burnout')) {
    mood = mood === 'positive' ? 'neutral' : 'negative';
    reasons.push('risk flags detected');
    needsCoaching = true;
  }

  return { mood, needsCoaching, reasons };
}

export function generateCoachingSuggestion(
  assessment: ReturnType<typeof assessUserState>,
  operatingPicture: OperatingPicture,
  ragContext: RagResult[],
  config: PersonalizationRuntime
): CoachingSuggestion | null {
  if (!assessment.needsCoaching) return null;

  const { mood, reasons } = assessment;

  // High priority for negative mood
  if (mood === 'negative') {
    if (reasons.includes('negative language detected')) {
      return {
        type: 'motivation',
        message: "I notice you're feeling down. Remember, small steps can lead to big changes. What's one thing you can do today to feel a bit better?",
        priority: 'high',
        context: 'Detected negative emotions in user input'
      };
    }
  }

  // Medium priority for missed days
  if (reasons.includes('missed reflection days')) {
    return {
      type: 'reflection',
      message: `It's been ${operatingPicture.cadence_profile.missed_day_count} days since your last reflection. Taking a moment to journal can help clarify your thoughts and reduce stress.`,
      priority: 'medium',
      context: 'User has missed reflection days'
    };
  }

  // Goal check
  if (reasons.includes('no active goals') || reasons.includes('has goals but no reflection cadence')) {
    const hasGoals = operatingPicture.top_goals.length > 0;
    if (hasGoals) {
      return {
        type: 'goal_check',
        message: "You have goals in progress! Regular check-ins help maintain momentum. Would you like to review your progress?",
        priority: 'medium',
        context: 'User has goals but may need cadence'
      };
    } else {
      return {
        type: 'goal_check',
        message: "Setting goals can provide direction and purpose. What would you like to work towards?",
        priority: 'low',
        context: 'No active goals detected'
      };
    }
  }

  // Stuck goals suggestion
  if (reasons.includes('goals feeling stuck')) {
    return {
      type: 'action',
      message: "It sounds like you're feeling stuck with your goals. Try breaking them into smaller steps or reflecting on what's holding you back.",
      priority: 'medium',
      context: 'Detected goal frustration',
    };
  }

  // Gratitude suggestion
  if (config.spiritual_on && mood === 'neutral') {
    return {
      type: 'gratitude',
      message: "Consider noting something you're grateful for today. Gratitude can shift perspective and improve well-being.",
      priority: 'low',
      context: 'Spiritual prompts enabled'
    };
  }

  return null;
}

export function integrateCoachingIntoResponse(
  baseResponse: string,
  suggestion: CoachingSuggestion | null,
  config: PersonalizationRuntime
): string {
  if (!suggestion) return baseResponse;

  const tone = config.tone;
  let intro = '';

  switch (tone) {
    case 'soft':
      intro = "Gently, ";
      break;
    case 'neutral':
      intro = "Also, ";
      break;
    case 'direct':
      intro = "Importantly, ";
      break;
  }

  const coachingText = `${intro}${suggestion.message}`;

  // Append or integrate based on priority
  if (suggestion.priority === 'high') {
    return `${coachingText}\n\n${baseResponse}`;
  } else {
    return `${baseResponse}\n\n${coachingText}`;
  }
}
