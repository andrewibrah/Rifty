import AsyncStorage from '@react-native-async-storage/async-storage';
import { nanoid } from '@/agent/utils/nanoid';
import type { RouteDecision } from '@/agent/types';

const STORAGE_KEY = 'riflett_traces_v2';
const MAX_TRACES = 100;

let storageLock = Promise.resolve<void>(undefined);

const withStorageLock = async <T>(task: () => Promise<T>): Promise<T> => {
  let release: (() => void) | null = null;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = storageLock;
  storageLock = previous.then(() => next);
  try {
    await previous;
    return await task();
  } finally {
    release?.();
  }
};
export interface RetrievalTelemetry {
  id: string;
  kind: string;
  compositeScore: number;
  scoring: {
    recency: number;
    priority: number;
    semantic: number;
    affect: number;
    relationship: number;
  };
}

export interface PlannerTelemetry {
  action: string | null;
  ask: string | null;
  payloadPreview: string | null;
}

export type ActionStatus = 'pending' | 'accepted' | 'declined' | 'failed' | 'none';

export interface ActionTelemetry {
  type: string;
  status: ActionStatus;
  ids: string[];
  metadata?: Record<string, unknown>;
}

export interface ConfidenceTelemetry {
  retrieval: number;
  plan: number;
  overall: number;
}

export interface TraceEvent {
  id: string;
  ts: number;
  maskedUserText: string;
  intentLabel: string;
  intentConfidence: number;
  decision: RouteDecision;
  retrieval: RetrievalTelemetry[];
  redactionSummary: Record<string, number>;
  latencyMs?: number;
  planner?: PlannerTelemetry | null;
  action?: ActionTelemetry | null;
  confidence?: ConfidenceTelemetry | null;
  receipts?: string[];
}

const loadTraces = async (): Promise<TraceEvent[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TraceEvent[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveTraces = async (traces: TraceEvent[]): Promise<void> => {
  const trimmed = traces
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_TRACES);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn('[telemetry] save failed', error);
  }
};

export const Telemetry = {
  async record(params: {
    maskedUserText: string;
    intentLabel: string;
    intentConfidence: number;
    decision: RouteDecision;
    retrieval: RetrievalTelemetry[];
    redactionSummary: Record<string, number>;
    startedAt: number;
  }): Promise<string> {
    return withStorageLock(async () => {
      const traces = await loadTraces();
      const id = nanoid();
      traces.unshift({
        id,
        ts: Date.now(),
        maskedUserText: params.maskedUserText,
        intentLabel: params.intentLabel,
        intentConfidence: params.intentConfidence,
        decision: params.decision,
        retrieval: params.retrieval,
        redactionSummary: params.redactionSummary,
        latencyMs: Date.now() - params.startedAt,
        planner: null,
        action: null,
      });
      await saveTraces(traces);
      return id;
    });
  },

  async update(id: string, patch: Partial<TraceEvent>): Promise<void> {
    await withStorageLock(async () => {
      const traces = await loadTraces();
      const next = traces.map((trace) =>
        trace.id === id
          ? {
              ...trace,
              ...patch,
            }
          : trace
      );
      await saveTraces(next);
    });
  },
};
