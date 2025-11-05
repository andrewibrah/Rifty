import { getNumberEnv } from "./config.ts";

export const DEFAULT_LINK_THRESHOLD = 0.82;
export const DEFAULT_DEDUPE_THRESHOLD = 0.9;
export const EXPECTED_EMBEDDING_DIM = 1536;

export type MicroStep = {
  id: string;
  description: string;
  completed: boolean;
  completed_at: string | null;
};

export type ReflectionRecord = {
  alignment_score: number;
  created_at: string;
  emotion: Record<string, unknown> | null;
  entry_embedding?: number[] | null;
};

export function cosineSimilarity(a?: number[] | null, b?: number[] | null): number {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) {
    console.warn(`[cosineSimilarity] dimension mismatch: ${a.length} vs ${b.length}`);
    return 0;
  }
  if (a.length !== EXPECTED_EMBEDDING_DIM) {
    console.warn(
      `[cosineSimilarity] unexpected vector dimension ${a.length} (expected ${EXPECTED_EMBEDDING_DIM})`,
    );
    return 0;
  }
  const length = a.length;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function averageVectors(vectors: (number[] | null | undefined)[]): number[] | null {
  const filtered = vectors.filter((vector): vector is number[] => Array.isArray(vector));
  if (filtered.length === 0) return null;
  const length = filtered[0]?.length ?? 0;
  if (length === 0) return null;
  const allSameLength = filtered.every((vector) => vector.length === length);
  if (!allSameLength) {
    throw new Error("Inconsistent vector dimensions");
  }
  const sum = new Array<number>(length).fill(0);
  filtered.forEach((vector) => {
    for (let i = 0; i < length; i += 1) {
      sum[i] += vector[i] ?? 0;
    }
  });
  return sum.map((value) => value / filtered.length);
}

export function computeProgress(steps: MicroStep[]): { completed: number; total: number; pct: number } {
  const total = steps.length;
  if (total === 0) {
    return { completed: 0, total: 0, pct: 0 };
  }
  const completed = steps.filter((step) => step.completed).length;
  return { completed, total, pct: completed / total };
}

export function computeReflectionDensity(
  reflections: ReflectionRecord[],
  windowDays = 21
): number {
  if (reflections.length === 0) return 0;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const recent = reflections.filter((reflection) =>
    new Date(reflection.created_at).getTime() >= cutoff
  );
  // Normalize: 3 reflections within window ⇒ density ~1
  return Math.min(1, recent.length / 3);
}

export function computeEmotionalConsistency(reflections: ReflectionRecord[]): number {
  const valences = reflections
    .map((reflection) => {
      const valence =
        typeof reflection.emotion?.valence === "number"
          ? reflection.emotion.valence
          : null;
      if (valence === null) return null;
      return Math.max(0, Math.min(1, valence));
    })
    .filter((value): value is number => value !== null);

  if (valences.length < 2) return 0.5;

  const mean = valences.reduce((acc, value) => acc + value, 0) / valences.length;
  const variance =
    valences.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
    (valences.length - 1 || 1);

  const stdDev = Math.sqrt(variance);
  const normalized = Math.max(0, Math.min(1, 1 - stdDev));
  return normalized;
}

export function computeMomentum(steps: MicroStep[]): number {
  if (steps.length === 0) return 0;
  const windowMs = 14 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const completions = steps.filter((step) => {
    if (!step.completed || !step.completed_at) return false;
    const ts = new Date(step.completed_at).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
  return Math.min(1, completions / Math.max(steps.length, 1));
}

export function computeDrift(
  goalEmbedding: number[] | null | undefined,
  reflectionEmbeddings: (number[] | null | undefined)[]
): number {
  if (!Array.isArray(goalEmbedding)) return 1;
  const centroid = averageVectors(reflectionEmbeddings);
  if (!centroid) return 1;
  return cosineSimilarity(goalEmbedding, centroid);
}

export function computeCoherenceScore({
  reflectionDensity,
  emotionalConsistency,
  momentum,
}: {
  reflectionDensity: number;
  emotionalConsistency: number;
  momentum: number;
}): number {
  const weighted =
    0.45 * reflectionDensity + 0.3 * emotionalConsistency + 0.25 * momentum;
  return Math.max(0, Math.min(1, weighted));
}

export function deriveGhiState(params: {
  status: string;
  progressPct: number;
  reflectionDensity: number;
  drift: number;
  momentum: number;
}): "alive" | "dormant" | "misaligned" | "complete" | "unknown" {
  const { status, progressPct, reflectionDensity, drift, momentum } = params;

  if (status === "completed" || progressPct >= 0.999) {
    return "complete";
  }

  if (drift < 0.7 && reflectionDensity < 0.3) {
    return "misaligned";
  }

  if (reflectionDensity < 0.2 && momentum < 0.2) {
    return "dormant";
  }

  if (reflectionDensity > 0.4 || momentum > 0.3) {
    return "alive";
  }

  return "unknown";
}

export function resolveLinkThreshold(): number {
  return getNumberEnv("RIFLETT_LINK_THRESHOLD", DEFAULT_LINK_THRESHOLD) ?? DEFAULT_LINK_THRESHOLD;
}

export function resolveDedupeThreshold(): number {
  return (
    getNumberEnv("RIFLETT_DEDUPE_THRESHOLD", DEFAULT_DEDUPE_THRESHOLD) ?? DEFAULT_DEDUPE_THRESHOLD
  );
}
