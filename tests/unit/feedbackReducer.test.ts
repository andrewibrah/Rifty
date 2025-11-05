import { describe, expect, it } from "vitest";
import {
  feedbackReducer,
  feedbackReducerInitialState,
  type FeedbackState,
} from "@/state/feedbackReducer";

describe("feedbackReducer", () => {
  it("stores selected label as draft", () => {
    const next = feedbackReducer(feedbackReducerInitialState, {
      type: "select",
      messageId: "msg-1",
      label: "unhelpful",
    });

    expect(next["msg-1"]).toBeDefined();
    expect(next["msg-1"].label).toBe("unhelpful");
    expect(next["msg-1"].status).toBe("draft");
  });

  it("toggles tags and keeps history", () => {
    let state: FeedbackState = feedbackReducer(feedbackReducerInitialState, {
      type: "select",
      messageId: "msg-2",
      label: "neutral",
    });

    state = feedbackReducer(state, {
      type: "toggleTag",
      messageId: "msg-2",
      tag: "Tone mismatch",
    });

    expect(state["msg-2"].tags).toContain("Tone mismatch");

    state = feedbackReducer(state, {
      type: "toggleTag",
      messageId: "msg-2",
      tag: "Tone mismatch",
    });

    expect(state["msg-2"].tags).not.toContain("Tone mismatch");
  });

  it("sets status with error message", () => {
    let state = feedbackReducer(feedbackReducerInitialState, {
      type: "select",
      messageId: "msg-3",
      label: "helpful",
    });

    state = feedbackReducer(state, {
      type: "setStatus",
      messageId: "msg-3",
      status: "queued",
      error: "network",
    });

    expect(state["msg-3"].status).toBe("queued");
    expect(state["msg-3"].error).toBe("network");
  });

  it("resets state for message", () => {
    let state = feedbackReducer(feedbackReducerInitialState, {
      type: "select",
      messageId: "msg-4",
      label: "helpful",
    });

    expect(state["msg-4"]).toBeDefined();

    state = feedbackReducer(state, {
      type: "reset",
      messageId: "msg-4",
    });

    expect(state["msg-4"]).toBeUndefined();
  });
});
