import AsyncStorage from '@react-native-async-storage/async-storage';
import { nanoid } from '@/agent/utils/nanoid';
import type { RouteDecision, RoutedIntent, EnrichedPayload, PlannerResponse } from '@/agent/types';

const STORAGE_KEY = 'riflett_traces_v1';
const MAX_TRACES = 100;

export interface TraceEvent {
  id: string;
  ts: number;
  userText: string;
  intent: RoutedIntent;
  decision: RouteDecision;
  plan?: PlannerResponse | null;
  latencyMs?: number;
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
    userText: string;
    intent: RoutedIntent;
    decision: RouteDecision;
    plan?: PlannerResponse | null;
    startedAt: number;
  }): Promise<string> {
    const traces = await loadTraces();
    const id = nanoid();
    traces.unshift({
      id,
      ts: Date.now(),
      userText: params.userText,
      intent: params.intent,
      decision: params.decision,
      plan: params.plan ?? null,
      latencyMs: Date.now() - params.startedAt,
    });
    await saveTraces(traces);
    return id;
  },

  async update(id: string, patch: Partial<TraceEvent>): Promise<void> {
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
  },
};
