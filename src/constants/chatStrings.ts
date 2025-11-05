export const chatStrings = {
  feedback: {
    headline: "How helpful was this?",
    helpful: "Helpful",
    neutral: "Neutral",
    unhelpful: "Needs work",
    correctionPlaceholder: "Share a quick correction (optional)",
    tagsLabel: "Tag the miss",
    tagOptions: [
      "Missed intent",
      "Missing context",
      "Tone mismatch",
      "Too generic",
      "Fact issue",
    ],
    submit: "Send feedback",
    submitted: "Thanks for the signal—Riflett is learning.",
    queued: "Saved offline. We'll sync once you're back.",
    retrying: "Retrying feedback…",
    sessionMissing: "Sign in to send feedback.",
  },
  context: {
    title: "Context compass",
    modes: "Recent modes",
    topics: "Top topics",
    evidence: "Evidence pulls",
    collapsedHint: "Tap to review the context Riflett sees.",
    fatigueHighlight: "Riflett noticed a fatigue pattern—consider a quick recovery plan.",
    empty: "No context yet. Start typing to refresh.",
  },
  lessons: {
    title: "Lessons applied",
    dismiss: "Hide for now",
  },
  metadata: {
    latencyFast: "Instant response",
    latencyMedium: "Took a moment",
    latencySlow: "Slow lane reply",
    copyEventId: "Copied event id",
  },
  toasts: {
    failureQueued: "Captured failure for follow-up.",
    failureError: "Couldn't reach the failure tracker.",
    contextError: "Context rebuild failed—will retry soon.",
  },
} as const;

export type ChatStrings = typeof chatStrings;
