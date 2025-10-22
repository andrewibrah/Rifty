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
