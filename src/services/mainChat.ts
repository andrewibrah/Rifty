import type { PlannerResponse } from '@/agent/types';
import type { IntentPayload } from '@/chat/handleMessage';
import { resolveOpenAIApiKey } from './ai';

type MainChatAiResponse = {
  reply: string;
  learned: string;
  ethical: string;
};

const MODEL_NAME = 'gpt-4o-mini' as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'learned', 'ethical'],
  properties: {
    reply: {
      type: 'string',
      description:
        'Constructive, empathetic response for the user. Reference context where relevant and keep it concise.',
    },
    learned: {
      type: 'string',
      description:
        'Short bullet-style summary of new insights about the user gained from this exchange.',
    },
    ethical: {
      type: 'string',
      description:
        'Plain-English description of the reflective process or safety checks performed.',
    },
  },
} as const;

const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'emit_riflett_main_reply',
    description:
      'Return the final assistant reply along with any learning updates and ethical notes.',
    parameters: RESPONSE_SCHEMA,
  },
} as const;

const stripCodeFences = (input: string): string =>
  input.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

const parseToolArguments = (raw: string): MainChatAiResponse => {
  const parsed = JSON.parse(raw) as MainChatAiResponse;
  validateResponse(parsed);
  return parsed;
};

function validateResponse(payload: any): asserts payload is MainChatAiResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI response missing payload');
  }
  (['reply', 'learned', 'ethical'] as const).forEach((key) => {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) {
      throw new Error(`AI response missing required string field: ${key}`);
    }
  });
}

const formatMatches = (matches: IntentPayload['memoryMatches']): string => {
  if (!Array.isArray(matches) || matches.length === 0) {
    return 'No prior memories matched.';
  }

  return matches
    .slice(0, 5)
    .map((match, index) => {
      const when = match.ts ? new Date(match.ts).toISOString() : 'unknown';
      return `[${index + 1}] ${when} (${match.kind}): ${match.text}`;
    })
    .join('\n');
};

const buildUserPrompt = (args: {
  userText: string;
  intent: IntentPayload;
  planner?: PlannerResponse | null;
}): string => {
  const { userText, intent, planner } = args;

  const routedIntent = intent.routedIntent;
  const contextBlock = intent.enriched.contextSnippets.join('\n---\n');
  const memoryBlock = formatMatches(intent.memoryMatches);
  const userConfig = JSON.stringify(intent.enriched.userConfig ?? {}, null, 2);

  const plannerSummary = planner
    ? `\n[PLAN]\nAction: ${planner.action}\nPayload: ${JSON.stringify(
        planner.payload ?? {},
        null,
        2
      )}\nClarify: ${planner.ask ?? 'null'}`
    : '\n[PLAN]\nAction: none (fallback to coaching response)';

  const decisionSummary =
    intent.decision.kind === 'commit'
      ? `Commit to ${intent.decision.primary}`
      : intent.decision.kind === 'clarify'
      ? `Clarify: ${intent.decision.question}`
      : 'Fallback mode';

  return `You are Riflett, the user's reflective coach.

[USER MESSAGE]
${userText}

[INTENT]
${routedIntent.label} (${(routedIntent.confidence * 100).toFixed(1)}%)
Decision: ${decisionSummary}
Slots: ${JSON.stringify(routedIntent.slots ?? {}, null, 2)}

[CONTEXT SNIPPETS]
${contextBlock || 'No contextual snippets.'}

[MEMORY MATCHES]
${memoryBlock}

[USER CONFIG]
${userConfig}
${plannerSummary}
`;
};

export async function generateMainChatReply(args: {
  userText: string;
  intent: IntentPayload;
  planner?: PlannerResponse | null;
  apiKey?: string;
}): Promise<MainChatAiResponse> {
  const apiKey = resolveOpenAIApiKey(args.apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const systemPrompt =
    'Respond as Riflett, an empathetic reflective partner. Provide grounded coaching that references context when helpful and stays actionable. Always return JSON via the provided tool.';

  const body = {
    model: MODEL_NAME,
    temperature: 0.6,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserPrompt(args) },
    ],
    tools: [TOOL_DEFINITION],
    tool_choice: { type: 'function', function: { name: 'emit_riflett_main_reply' } },
  };

  let response: Response | null = null;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const message =
        response.status === 401
          ? 'AI request unauthorized. Check API key.'
          : `AI request failed (${response.status}).`;
      console.warn('[mainChat] OpenAI error', response.status, errorText);
      throw new Error(message);
    }

    const data = await response.json();
    const choice = data?.choices?.[0]?.message;
    const toolCall = choice?.tool_calls?.[0];
    const argumentString: string | undefined = toolCall?.function?.arguments;

    if (argumentString) {
      return parseToolArguments(argumentString);
    }

    const content = typeof choice?.content === 'string' ? choice.content : '';
    if (!content) {
      throw new Error('AI response missing content');
    }

    const fallback = JSON.parse(stripCodeFences(content)) as MainChatAiResponse;
    validateResponse(fallback);
    return fallback;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('AI request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
