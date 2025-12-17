import type { ContextSnapshot } from "@/services/riflettSpine";

export interface ContextPanelModel {
  modes: ContextSnapshot["recent_modes"];
  topics: ContextSnapshot["top_topics"];
  evidence: ContextSnapshot["evidence_nodes"];
  fatigueHighlight: boolean;
  empty: boolean;
}

const FATIGUE_PATTERN = /tired\s+again|exhausted\s+again|burned\s*out/gi;

export function normalizeComposerCue(input: string): boolean {
  if (!input) return false;
  return FATIGUE_PATTERN.test(input.toLowerCase());
}

export function filterEvidenceByTrust(
  snapshot: ContextSnapshot,
  threshold = 0.4
) {
  return snapshot.evidence_nodes.filter((node) => node.trust_weight >= threshold);
}

export function hasFatigueEvidence(evidence: ContextSnapshot["evidence_nodes"]): boolean {
  return evidence.some((node) => node.sources.includes("fatigue_recall"));
}

export function buildContextPanelModel(
  snapshot: ContextSnapshot | null,
  composerText: string,
  threshold = 0.4
): ContextPanelModel {
  if (!snapshot) {
    return {
      modes: [],
      topics: [],
      evidence: [],
      fatigueHighlight: normalizeComposerCue(composerText),
      empty: true,
    };
  }

  const evidence = filterEvidenceByTrust(snapshot, threshold);
  const fatigueHighlight =
    normalizeComposerCue(composerText) || hasFatigueEvidence(evidence);

  return {
    modes: snapshot.recent_modes,
    topics: snapshot.top_topics,
    evidence,
    fatigueHighlight,
    empty:
      snapshot.recent_modes.length === 0 &&
      snapshot.top_topics.length === 0 &&
      evidence.length === 0,
  };
}
