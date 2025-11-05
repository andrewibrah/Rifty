import { describe, it, expect, beforeEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mockMemoryRecord = {
    id: 'rec-1',
    kind: 'entry',
    ts: Date.now(),
    score: 0.2,
    text: 'previous entry',
  };

  const memorySearchMock = vi.fn().mockResolvedValue([mockMemoryRecord]);
  const slotFillMock = vi.fn((text, base) => ({
    ...base,
    label: base.label,
    confidence: base.confidence,
    slots: {},
  }));
  const redactorMock = vi.fn((text: string) => ({ masked: text, replacementMap: {} }));
  const userConfigSnapshot = {
    resolved_at: new Date().toISOString(),
    user_settings: {},
    persona: {},
    privacy_gates: {},
    crisis_rules: {},
  };
  const telemetryMock = vi.fn().mockResolvedValue('trace-123');

  return {
    mockMemoryRecord,
    memorySearchMock,
    slotFillMock,
    redactorMock,
    userConfigSnapshot,
    telemetryMock,
  };
});

vi.mock('@/agent/memory', () => ({
  Memory: {
    searchTopN: hoisted.memorySearchMock,
  },
}));

vi.mock('@/agent/slotFiller', () => ({
  SlotFiller: {
    fill: hoisted.slotFillMock,
  },
}));

vi.mock('@/agent/redactor', () => ({
  Redactor: {
    mask: hoisted.redactorMock,
  },
}));

vi.mock('@/agent/userConfig', () => ({
  UserConfig: {
    snapshot: vi.fn().mockResolvedValue(hoisted.userConfigSnapshot),
    loadUserConfig: vi.fn().mockResolvedValue(hoisted.userConfigSnapshot),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/agent/intentRouting', () => ({
  buildRoutedIntent: vi.fn((nativeIntent) => ({
    label: nativeIntent.label,
    confidence: nativeIntent.confidence,
    slots: {},
    confidence_delta: 0,
  })),
  route: vi.fn().mockReturnValue({ handler: 'journal' }),
}));

vi.mock('@/agent/telemetry', () => ({
  Telemetry: {
    record: hoisted.telemetryMock,
  },
}));

vi.mock('@/agent/riflettIntentClassifier', () => ({
  classifyRiflettIntent: vi.fn().mockReturnValue({
    label: 'journal',
    confidence: 0.88,
    topCandidates: [{ label: 'journal', confidence: 0.88 }],
    reasons: [],
    duplicateMatch: null,
    targetEntryId: null,
    targetEntryType: null,
  }),
  toNativeLabel: vi.fn((label: string) => label.toUpperCase()),
}));

vi.mock('@/services/goals.unified', () => ({
  listActiveGoalsWithContext: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/constants/intents', () => ({
  getIntentDefinition: vi.fn(() => ({
    label: 'Journal',
  })),
}));

import { Memory } from '@/agent/memory';
import { Telemetry } from '@/agent/telemetry';
import { handleUtterance } from '@/agent/pipeline';

describe('handleUtterance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null options safely', async () => {
    const result = await handleUtterance('Hello there!', null as any);
    expect(result.decision).toEqual({ handler: 'journal' });
    expect(vi.mocked(Memory.searchTopN)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Telemetry.record)).toHaveBeenCalledTimes(1);
    expect(result.traceId).toBe('trace-123');
  });
});
