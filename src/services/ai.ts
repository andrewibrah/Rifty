import Constants from 'expo-constants';
import { Annotation } from '../db';
import type { AnnotationChannel } from '../db';

type AIResponse = {
  reply: string;
  learned: string;
  ethical: string;
};

// Use a model you actually have (from your list)
const MODEL_NAME = 'gpt-4o-mini' as const;

/** Build plain-text context from entry + prior annotations */
function buildContext(entryContent: string, annotations: Annotation[]): string {
  const history = annotations
    .map((a) => {
      const speaker = a.kind === 'bot' ? 'AI/Bot' : 'User';
      const label = a.channel?.toUpperCase() ?? 'NOTE';
      return `${speaker} (${label}) @ ${a.created_at ?? 'unknown'}: ${a.content}`;
    })
    .join('\n');

  return [
    `Entry Summary: ${entryContent}`,
    history ? `Conversation History:\n${history}` : 'Conversation History: none yet.',
  ].join('\n\n');
}

/** Main call: uses Chat Completions + tool/function calling for strict JSON */
export async function generateAIResponse(params: {
  apiKey?: string;
  entryContent: string;
  annotations: Annotation[];
  userMessage: string;
  entryType: string;
}): Promise<AIResponse> {
  const apiKey =
    params.apiKey ||
    process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
    (Constants?.expoConfig?.extra as any)?.openaiApiKey ||
    (Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Add EXPO_PUBLIC_OPENAI_API_KEY to your environment.');
  }

  const context = buildContext(params.entryContent, params.annotations);

  const systemPrompt = `You are Reflectify, a red-and-black themed reflective coach.
Scope: ONLY respond for the entry-specific chat.
Tasks:
- For goals: provide coaching, options, techniques, and growth plans.
- For journals: analyze details, meanings, patterns; provide insights and enlightenment.
- For schedules: mental and readiness preparation.
You must emit your final data via the provided tool with keys: reply, learned, ethical. Keep reply concise, practical, empathetic.`;

  const userPrompt = `Entry category: ${params.entryType}

${context}

New user request: ${params.userMessage}`;

  // Define a single function/tool that encodes the schema we want back
  const tools = [
    {
      type: 'function',
      function: {
        name: 'emit_reflectify_payload',
        description:
          'Return the final assistant message plus extracted learning about the user and the ethical/process steps used.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['reply', 'learned', 'ethical'],
          properties: {
            reply: {
              type: 'string',
              description: 'Warm, constructive answer for the user request.',
            },
            learned: {
              type: 'string',
              description:
                'Direct summary of new insights about the user personality gleaned from this exchange.',
            },
            ethical: {
              type: 'string',
              description:
                'Plain-English step-by-step outline of ethical and process responsibilities taken while crafting the reply.',
            },
          },
        },
      },
    },
  ] as const;

  const body = {
    model: MODEL_NAME,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    // Force the model to call our function with JSON args
    tools,
    tool_choice: { type: 'function', function: { name: 'emit_reflectify_payload' } },
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${errorBody}`);
  }

  const data = await res.json();

  // Tool/function calling: parse JSON from tool call arguments
  const msg = data?.choices?.[0]?.message;
  const toolCall = msg?.tool_calls?.[0];
  const argStr: string | undefined = toolCall?.function?.arguments;

  if (!argStr) {
    // Some models might put JSON into content as fallback; try that too
    const content = typeof msg?.content === 'string' ? msg.content : '';
    if (!content) {
      throw new Error('OpenAI response missing tool call and content.');
    }
    try {
      const parsed = JSON.parse(stripCodeFences(content)) as AIResponse;
      validateAIResponse(parsed);
      return parsed;
    } catch {
      throw new Error('Unable to parse OpenAI response as JSON.');
    }
  }

  let parsed: AIResponse;
  try {
    parsed = JSON.parse(argStr) as AIResponse;
  } catch {
    throw new Error('Unable to parse tool call arguments as JSON.');
  }
  validateAIResponse(parsed);
  return parsed;
}

function stripCodeFences(s: string) {
  // Handles ```json ... ``` wrappers if they appear
  return s.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
}

function validateAIResponse(p: any): asserts p is AIResponse {
  if (!p || typeof p !== 'object') throw new Error('AI response not an object.');
  for (const k of ['reply', 'learned', 'ethical'] as const) {
    if (typeof p[k] !== 'string' || !p[k].trim()) {
      throw new Error(`AI response missing required string field: ${k}`);
    }
  }
}

export function formatAnnotationLabel(channel: AnnotationChannel): string {
  switch (channel) {
    case 'ai':
      return 'AI';
    case 'system':
      return 'System';
    default:
      return 'Note';
  }
}
