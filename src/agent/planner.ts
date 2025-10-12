import Constants from 'expo-constants';
import { resolveOpenAIApiKey } from '@/services/ai';
import type { EnrichedPayload, PlannerResponse } from '@/agent/types';
import { EdgeCache } from '@/agent/cache';

export interface PlannerResult {
  response: PlannerResponse | null;
  raw: any;
}

const PLANNER_SYSTEM_PROMPT = `You are Riflett’s planner. Always return JSON matching the supplied schema.
If unsure, ask exactly one clarifying question in the ask field, else leave it null.`;

const ACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'ask', 'payload'],
  properties: {
    action: {
      type: 'string',
      enum: [
        'journal.create',
        'goal.create',
        'schedule.create',
        'reflect',
        'settings.update',
        'noop',
      ],
    },
    ask: {
      anyOf: [
        { type: 'string' },
        { type: 'null' },
      ],
    },
    payload: {
      type: 'object',
    },
  },
} as const;

const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'plan_router',
    description: 'Select downstream action and structured payload for Riflett subsystems.',
    parameters: ACTION_SCHEMA,
  },
} as const;

const getExpoExtra = () =>
  (Constants?.expoConfig?.extra ?? {}) as Record<string, any>;

const resolveModel = (): string => {
  const extra = getExpoExtra();
  const configured = extra?.plannerModel as string | undefined;
  return configured || 'gpt-4o-mini';
};

const buildPrompt = (payload: EnrichedPayload): string => {
  const intent = payload.intent;
  const context = payload.contextSnippets.join('\n---\n');

  const probability = intent.confidence.toFixed(2);
  const secondary = intent.secondBest && intent.secondConfidence
    ? `\nSecondary intent: ${intent.secondBest} (${intent.secondConfidence?.toFixed(2)})`
    : '';

  return `"""
[INTENT]
${intent.label} (p=${probability})${secondary}

[SLOTS]
${JSON.stringify(intent.slots, null, 2)}

[CONTEXT]
${context || 'n/a'}

[USER]
${payload.userText}

[USER_CONFIG]
${JSON.stringify(payload.userConfig ?? {}, null, 2)}
"""`;
};

type OfflineCapableError = Error & { offline?: boolean };

const isOfflineNetworkError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message = typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
  return /Failed to fetch/i.test(message) || /Network request failed/i.test(message);
};

const hasOfflineFlag = (error: unknown): error is OfflineCapableError => {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'offline' in (error as Record<string, unknown>) &&
      typeof (error as OfflineCapableError).offline === 'boolean'
  );
};

const parseToolArguments = (raw: string): PlannerResponse | null => {
  try {
    const parsed = JSON.parse(raw) as PlannerResponse;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (
      typeof parsed.action !== 'string' ||
      !['journal.create', 'goal.create', 'schedule.create', 'reflect', 'settings.update', 'noop'].includes(parsed.action)
    ) {
      return null;
    }
    if (
      parsed.ask !== null &&
      typeof parsed.ask !== 'string'
    ) {
      return null;
    }
    if (!parsed.payload || typeof parsed.payload !== 'object') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('[planner] Failed to parse tool args', error);
    return null;
  }
};

const buildCacheKey = (payload: EnrichedPayload): string => {
  return JSON.stringify({
    label: payload.intent.label,
    slots: payload.intent.slots,
    context: payload.contextSnippets,
    text: payload.userText,
  });
};

const plannerTTL = (action: string | undefined): number => {
  switch (action) {
    case 'reflect':
      return 2 * 60 * 1000;
    case 'settings.update':
      return 5 * 60 * 1000;
    case 'noop':
      return 60 * 1000;
    default:
      return 0;
  }
};

export async function planAction(args: {
  payload: EnrichedPayload;
  apiKey?: string;
}): Promise<PlannerResult> {
  const cacheKey = buildCacheKey(args.payload);
  const cached = await EdgeCache.get<PlannerResponse>(cacheKey);
  if (cached) {
    return {
      response: cached,
      raw: { cached: true },
    };
  }

  const apiKey = resolveOpenAIApiKey(args.apiKey);
  const body = {
    model: resolveModel(),
    temperature: 0,
    tools: [TOOL_DEFINITION],
    tool_choice: {
      type: 'function',
      function: { name: 'plan_router' },
    },
    messages: [
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(args.payload) },
    ],
  };

  let data: any;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const error = new Error(
        `Planner request failed: ${res.status} ${errorBody.slice(0, 160)}`
      );
      throw error;
    }

    data = await res.json();
  } catch (error: unknown) {
    if (hasOfflineFlag(error) && error.offline) {
      throw error;
    }

    const offline = isOfflineNetworkError(error);
    const baseMessage =
      error instanceof Error && typeof error.message === 'string'
        ? error.message
        : 'Planner request failed';
    const offlineError: OfflineCapableError = new Error(
      offline ? 'Planner offline' : baseMessage
    );
    offlineError.offline = offline;
    throw offlineError;
  }
  const firstChoice = data?.choices?.[0]?.message;
  const toolCall = firstChoice?.tool_calls?.[0];
  const rawArgs: string | undefined = toolCall?.function?.arguments;
  const parsed = rawArgs ? parseToolArguments(rawArgs) : null;

  if (parsed) {
    const ttl = plannerTTL(parsed.action);
    if (ttl > 0) {
      EdgeCache.set(cacheKey, parsed, ttl).catch((error) => {
        console.warn('[planner] cache set failed', error);
      });
    }
  }

  return {
    response: parsed,
    raw: data,
  };
}

export const PlannerTools = TOOL_DEFINITION;
