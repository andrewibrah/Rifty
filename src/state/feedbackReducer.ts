import type { SubmitFeedbackInput } from "@/services/riflettSpine";

export type FeedbackLabel = SubmitFeedbackInput["label"];

export type FeedbackStatus =
  | "idle"
  | "draft"
  | "submitting"
  | "queued"
  | "submitted"
  | "error";

export interface FeedbackDraft {
  label: FeedbackLabel | null;
  correction: string;
  tags: string[];
  status: FeedbackStatus;
  error?: string | null;
  updatedAt: number;
}

export type FeedbackState = Record<string, FeedbackDraft>;

export type FeedbackAction =
  | { type: "select"; messageId: string; label: FeedbackLabel }
  | { type: "updateCorrection"; messageId: string; correction: string }
  | { type: "toggleTag"; messageId: string; tag: string }
  | { type: "setStatus"; messageId: string; status: FeedbackStatus; error?: string | null }
  | { type: "hydrate"; state: FeedbackState }
  | { type: "reset"; messageId: string };

const createDraft = (overrides: Partial<FeedbackDraft> = {}): FeedbackDraft => ({
  label: null,
  correction: "",
  tags: [],
  status: "idle",
  updatedAt: Date.now(),
  ...overrides,
});

const ensureDraft = (state: FeedbackState, messageId: string): FeedbackDraft => {
  return state[messageId] ?? createDraft();
};

export function feedbackReducer(
  state: FeedbackState,
  action: FeedbackAction
): FeedbackState {
  switch (action.type) {
    case "hydrate": {
      return { ...action.state };
    }
    case "select": {
      const next = ensureDraft(state, action.messageId);
      return {
        ...state,
        [action.messageId]: {
          ...next,
          label: action.label,
          status: "draft",
          updatedAt: Date.now(),
          error: null,
        },
      };
    }
    case "updateCorrection": {
      const next = ensureDraft(state, action.messageId);
      return {
        ...state,
        [action.messageId]: {
          ...next,
          correction: action.correction,
          status: next.status === "idle" ? "draft" : next.status,
          updatedAt: Date.now(),
        },
      };
    }
    case "toggleTag": {
      const next = ensureDraft(state, action.messageId);
      const exists = next.tags.includes(action.tag);
      const tags = exists
        ? next.tags.filter((item) => item !== action.tag)
        : [...next.tags, action.tag];

      return {
        ...state,
        [action.messageId]: {
          ...next,
          tags,
          status: next.status === "idle" ? "draft" : next.status,
          updatedAt: Date.now(),
        },
      };
    }
    case "setStatus": {
      const next = ensureDraft(state, action.messageId);
      return {
        ...state,
        [action.messageId]: {
          ...next,
          status: action.status,
          error: action.error ?? null,
          updatedAt: Date.now(),
        },
      };
    }
    case "reset": {
      const nextState = { ...state };
      delete nextState[action.messageId];
      return nextState;
    }
    default:
      return state;
  }
}

export const feedbackReducerInitialState: FeedbackState = {};

export function serializeFeedbackState(state: FeedbackState): FeedbackState {
  return Object.fromEntries(
    Object.entries(state).map(([messageId, draft]) => [
      messageId,
      {
        ...draft,
        tags: [...draft.tags],
      },
    ])
  );
}
