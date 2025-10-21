import type { EntryType } from '@/services/data';

const WINDOW_TURN_LIMIT = 3;
const WINDOW_TIME_LIMIT_MS = 10 * 60 * 1000;

interface WindowState {
  entryId: string;
  entryType: EntryType | 'unknown';
  createdAt: number;
  turnsElapsed: number;
}

interface RecentMessage {
  text: string;
  ts: number;
}

let state: WindowState | null = null;
const recentMessages: RecentMessage[] = [];

const pruneStateIfExpired = () => {
  if (!state) return;
  const age = Date.now() - state.createdAt;
  if (age > WINDOW_TIME_LIMIT_MS || state.turnsElapsed >= WINDOW_TURN_LIMIT) {
    state = null;
  }
};

export interface ContextSnapshot {
  entryId: string;
  entryType: EntryType | 'unknown';
  createdAt: number;
  turnsElapsed: number;
  ageMs: number;
  isActive: boolean;
}

export const ContextWindow = {
  registerEntry(entryId: string, entryType: EntryType | 'unknown' = 'unknown') {
    state = {
      entryId,
      entryType,
      createdAt: Date.now(),
      turnsElapsed: 0,
    };
  },

  refreshEntry(entryId: string, entryType: EntryType | 'unknown' = 'unknown') {
    const effectiveType = entryType !== 'unknown' ? entryType : state?.entryType ?? 'unknown';
    state = {
      entryId,
      entryType: effectiveType,
      createdAt: Date.now(),
      turnsElapsed: 0,
    };
  },

  clear() {
    state = null;
  },

  snapshot(): ContextSnapshot | null {
    pruneStateIfExpired();
    if (!state) return null;
    const age = Date.now() - state.createdAt;
    return {
      entryId: state.entryId,
      entryType: state.entryType,
      createdAt: state.createdAt,
      turnsElapsed: state.turnsElapsed,
      ageMs: age,
      isActive:
        age <= WINDOW_TIME_LIMIT_MS && state.turnsElapsed < WINDOW_TURN_LIMIT,
    };
  },

  recordUserMessage(text: string) {
    if (!text) return;
    recentMessages.push({ text, ts: Date.now() });
    while (recentMessages.length > 8) {
      recentMessages.shift();
    }
  },

  recent(): RecentMessage[] {
    return recentMessages.slice(-5);
  },

  advanceTurn(options: { createdEntry: boolean }) {
    pruneStateIfExpired();
    if (options.createdEntry) {
      if (state) {
        state.turnsElapsed = 0;
        state.createdAt = Date.now();
      }
      return;
    }
    if (!state) return;
    state.turnsElapsed += 1;
    pruneStateIfExpired();
  },
};
