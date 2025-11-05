import { describe, expect, it } from "vitest";
import {
  buildContextPanelModel,
  normalizeComposerCue,
} from "@/utils/contextCompass";
import type { ContextSnapshot } from "@/services/riflettSpine";

const mockSnapshot: ContextSnapshot = {
  recent_modes: [
    { label: "focused", count: 3, last_seen_at: "2025-02-10T10:00:00Z" },
  ],
  top_topics: [
    { topic: "energy", weight: 0.6 },
  ],
  last_goals: [],
  likely_need: "energy_check",
  evidence_nodes: [
    {
      id: "fatigue",
      type: "mood",
      text: "tired",
      strength: 0.7,
      trust_weight: 0.5,
      sentiment: -0.3,
      sources: ["fatigue_recall"],
    },
    {
      id: "weak",
      type: "topic",
      text: "hydration",
      strength: 0.2,
      trust_weight: 0.3,
      sentiment: 0.1,
      sources: ["vector_match"],
    },
  ],
};

describe("contextCompass", () => {
  it("filters evidence below trust threshold", () => {
    const model = buildContextPanelModel(mockSnapshot, "", 0.4);
    expect(model.evidence.length).toBe(1);
    expect(model.evidence[0]?.id).toBe("fatigue");
  });

  it("flags fatigue cues from composer text", () => {
    const highlighted = normalizeComposerCue("feeling tired again today");
    expect(highlighted).toBe(true);
  });

  it("highlights fatigue when evidence sourced", () => {
    const model = buildContextPanelModel(mockSnapshot, "", 0.4);
    expect(model.fatigueHighlight).toBe(true);
  });
});
