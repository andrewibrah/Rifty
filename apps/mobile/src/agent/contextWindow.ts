import type { EntryType } from '@/services/data';

const MAX_SEMANTIC_TURNS = 10;
const DECAY_FACTOR = 0.6;
const MIN_ACTIVE_SCORE = 0.2;

interface WindowState {
  entryId: string;
  entryType: EntryType | 'unknown';
  createdAt: number;
  decayScore: number;
}

interface RecentMessage {
  text: string;
  ts: number;
  score: number;
  isReceipt: boolean;
}

let state: WindowState | null = null;
const recentMessages: RecentMessage[] = [];

const computeMessageScore = (text: string): number => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return 0;
  const tokens = trimmed.split(/[^a-z0-9]+/i).filter(Boolean);
  if (!tokens.length) return 0;
  const uniqueTokens = new Set(tokens);
  const avgLength = tokens.reduce((sum, token) => sum + token.length, 0) / tokens.length;
  const base = Math.min(1, tokens.length / 12);
  const lexical = Math.min(1, avgLength / 5);
  return Math.min(1, base * 0.6 + lexical * 0.4);
};

const isReceiptMessage = (text: string): boolean => {
  const lowered = text.toLowerCase();
  return lowered.includes('receipt') || lowered.includes('confirmed');
};

const pruneLowSignalMessages = () => {
  recentMessages.sort((a, b) => b.ts - a.ts);
  const preserved: RecentMessage[] = [];
  for (const message of recentMessages) {
    if (message.isReceipt) {
      preserved.push(message);
      continue;
    }
    if (preserved.length < MAX_SEMANTIC_TURNS) {
      preserved.push(message);
    }
  }
  preserved.sort((a, b) => a.ts - b.ts);
  while (preserved.length > MAX_SEMANTIC_TURNS) {
    preserved.shift();
  }
  recentMessages.length = 0;
  recentMessages.push(...preserved);
};

const applyDecay = (createdEntry: boolean) => {
  if (!state) return;
  if (createdEntry) {
    state.decayScore = 1;
    state.createdAt = Date.now();
    return;
  }
  state.decayScore *= DECAY_FACTOR;
  if (state.decayScore < MIN_ACTIVE_SCORE) {
    state = null;
  }
};

export interface ContextSnapshot {
  entryId: string;
  entryType: EntryType | 'unknown';
  createdAt: number;
  decayScore: number;
  isActive: boolean;
}

export const ContextWindow = {
  registerEntry(entryId: string, entryType: EntryType | 'unknown' = 'unknown') {
    state = {
      entryId,
      entryType,
      createdAt: Date.now(),
      decayScore: 1,
    };
  },

  refreshEntry(entryId: string, entryType: EntryType | 'unknown' = 'unknown') {
    const effectiveType = entryType !== 'unknown' ? entryType : state?.entryType ?? 'unknown';
    state = {
      entryId,
      entryType: effectiveType,
      createdAt: Date.now(),
      decayScore: 1,
    };
  },

  clear() {
    state = null;
    recentMessages.length = 0;
  },

  snapshot(): ContextSnapshot | null {
    if (!state) return null;
    const isActive = state.decayScore >= MIN_ACTIVE_SCORE;
    return {
      entryId: state.entryId,
      entryType: state.entryType,
      createdAt: state.createdAt,
      decayScore: state.decayScore,
      isActive,
    };
  },

  recordUserMessage(text: string) {
    if (!text) return;
    const score = computeMessageScore(text);
    const receipt = isReceiptMessage(text);
    const message: RecentMessage = {
      text,
      ts: Date.now(),
      score: receipt ? 1 : score,
      isReceipt: receipt,
    };
    recentMessages.push(message);
    pruneLowSignalMessages();
    if (state) {
      state.decayScore = Math.min(1, state.decayScore * DECAY_FACTOR + message.score * 0.5);
      if (state.decayScore < MIN_ACTIVE_SCORE && !receipt) {
        state = null;
      }
    }
  },

  recent(): RecentMessage[] {
    return recentMessages.slice(-MAX_SEMANTIC_TURNS);
  },

  advanceTurn(options: { createdEntry: boolean }) {
    applyDecay(options.createdEntry);
  },
};
