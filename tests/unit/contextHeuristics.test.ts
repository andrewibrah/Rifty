import { describe, expect, it } from "vitest";
import {
  aggregateModes,
  buildEvidence,
  inferLikelyNeed,
  type MemoryEdgeInput,
  type MemoryMatchInput,
  type MemoryNodeInput,
} from "@/services/contextHeuristics";

describe("context heuristics", () => {
  it("surfaces fatigue memories for vague prompts and infers energy need", () => {
    const matches: MemoryMatchInput[] = [
      {
        node_id: "topic-1",
        score: 0.82,
        node_type: "topic",
        text: "sleep quality",
        trust_weight: 0.75,
        sentiment: 0.1,
      },
    ];

    const neighborNodes = new Map<string, MemoryNodeInput>([
      [
        "topic-1",
        {
          id: "topic-1",
          type: "topic",
          text: "sleep quality",
          trust_weight: 0.75,
          sentiment: 0.1,
        },
      ],
      [
        "mood-fatigue",
        {
          id: "mood-fatigue",
          type: "mood",
          text: "tired",
          trust_weight: 0.88,
          sentiment: -0.4,
        },
      ],
    ]);

    const edges: MemoryEdgeInput[] = [
      {
        id: "edge-1",
        src_id: "entry-alpha",
        dst_id: "topic-1",
        relation: "mentions",
        weight: 0.72,
      },
    ];

    const fatigueNodes: MemoryNodeInput[] = [
      {
        id: "mood-fatigue",
        type: "mood",
        text: "tired",
        trust_weight: 0.88,
        sentiment: -0.4,
      },
    ];

    const evidence = buildEvidence(matches, edges, neighborNodes, fatigueNodes, 0.4);
    const fatigueEvidence = evidence.find((item) => item.id === "mood-fatigue");

    expect(fatigueEvidence).toBeTruthy();
    expect(fatigueEvidence?.sources).toContain("fatigue_recall");
    expect(fatigueEvidence?.strength).toBeGreaterThanOrEqual(0.35);

    const modes = aggregateModes([
      { mood: "Stressed", created_at: "2025-02-10T12:00:00Z" },
      { mood: "Stressed", created_at: "2025-02-12T09:00:00Z" },
      { mood: "Calm", created_at: "2025-02-09T08:00:00Z" },
    ]);

    expect(modes[0]?.label).toBe("stressed");

    const likelyNeed = inferLikelyNeed("feeling tired again", modes[0]?.label ?? null, evidence[0]?.text ?? null);
    expect(likelyNeed).toBe("energy_check");
  });
});
