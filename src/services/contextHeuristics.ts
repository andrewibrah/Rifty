export type MemoryNodeType = "entry" | "goal" | "topic" | "mood" | "anchor";

export interface ModeSample {
  mood: string | null;
  created_at: string;
}

export interface MemoryMatchInput {
  node_id: string;
  score: number;
  node_type: MemoryNodeType;
  text: string;
  trust_weight: number;
  sentiment: number | null;
}

export interface MemoryNodeInput {
  id: string;
  type: MemoryNodeType;
  text: string;
  trust_weight: number;
  sentiment: number | null;
}

export interface MemoryEdgeInput {
  id?: string;
  src_id: string;
  dst_id: string;
  relation: string;
  weight: number;
}

export interface EvidenceNode {
  id: string;
  type: MemoryNodeType;
  text: string;
  strength: number;
  trust_weight: number;
  sentiment: number | null;
  sources: string[];
}

export function inferLikelyNeed(
  inputText: string,
  dominantMood: string | null,
  topTopic: string | null
): string {
  const normalized = inputText.toLowerCase();
  if (normalized.includes("schedule") || normalized.includes("calendar")) {
    return "schedule_alignment";
  }
  if (normalized.includes("goal") || normalized.includes("progress")) {
    return "goal_support";
  }
  if (
    normalized.includes("tired") ||
    normalized.includes("fatigue") ||
    normalized.includes("exhausted") ||
    normalized.includes("burned out")
  ) {
    return "energy_check";
  }
  if (normalized.includes("again") && dominantMood === "stressed") {
    return "stress_recovery";
  }
  if (dominantMood === "tired") {
    return "restoration_prompt";
  }
  if (topTopic === "work" || topTopic === "project") {
    return "workload_review";
  }
  if (topTopic === "family" || topTopic === "relationships") {
    return "relationship_context";
  }
  return "context_refresh";
}

export function aggregateModes(entries: ModeSample[]) {
  const counts = new Map<string, { count: number; lastSeen: string }>();
  for (const entry of entries) {
    const mood = entry.mood?.trim().toLowerCase();
    if (!mood) continue;
    const current = counts.get(mood);
    if (current) {
      current.count += 1;
      if (current.lastSeen < entry.created_at) {
        current.lastSeen = entry.created_at;
      }
    } else {
      counts.set(mood, { count: 1, lastSeen: entry.created_at });
    }
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      last_seen_at: value.lastSeen,
    }))
    .sort((a, b) => b.count - a.count || b.last_seen_at.localeCompare(a.last_seen_at))
    .slice(0, 6);
}

export function buildEvidence(
  matches: MemoryMatchInput[],
  edgeRows: MemoryEdgeInput[],
  neighborNodes: Map<string, MemoryNodeInput>,
  includeFatigue: MemoryNodeInput[],
  threshold = 0.4
): EvidenceNode[] {
  const evidence = new Map<
    string,
    {
      id: string;
      type: MemoryNodeType;
      text: string;
      strength: number;
      trust_weight: number;
      sentiment: number | null;
      sources: Set<string>;
    }
  >();

  const addEvidence = (
    node: MemoryNodeInput,
    strength: number,
    source: string
  ) => {
    if (!node || strength < threshold) return;
    const existing = evidence.get(node.id);
    if (existing) {
      if (existing.strength < strength) {
        existing.strength = strength;
      }
      existing.sources.add(source);
    } else {
      evidence.set(node.id, {
        id: node.id,
        type: node.type,
        text: node.text,
        strength,
        trust_weight: node.trust_weight,
        sentiment: node.sentiment,
        sources: new Set([source]),
      });
    }
  };

  for (const match of matches) {
    addEvidence(
      {
        id: match.node_id,
        type: match.node_type,
        text: match.text,
        trust_weight: match.trust_weight,
        sentiment: match.sentiment,
      },
      match.score * match.trust_weight,
      "vector_match"
    );
  }

  for (const edge of edgeRows) {
    const source = neighborNodes.get(edge.src_id);
    const target = neighborNodes.get(edge.dst_id);
    if (!source || !target) continue;

    const forwardStrength = edge.weight * target.trust_weight;
    addEvidence(target, forwardStrength, `edge:${edge.relation}`);

    const reverseStrength = edge.weight * source.trust_weight;
    addEvidence(source, reverseStrength, `edge:${edge.relation}`);
  }

  for (const node of includeFatigue) {
    addEvidence(node, Math.min(0.9, node.trust_weight), "fatigue_recall");
  }

  return Array.from(evidence.values())
    .map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      strength: Number(item.strength.toFixed(3)),
      trust_weight: Number(item.trust_weight.toFixed(3)),
      sentiment: item.sentiment,
      sources: Array.from(item.sources).slice(0, 5),
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20);
}
