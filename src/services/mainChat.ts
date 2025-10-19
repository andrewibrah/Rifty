import type { PlannerResponse } from '@/agent/types'
import type { IntentPayload } from '@/chat/handleMessage'
import { resolveOpenAIApiKey } from './ai'

type MainChatAiResponse = {
  reply: string
  learned: string
  ethical: string
}

const MODEL_NAME = 'gpt-4o-mini' as const

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
} as const

const JSON_SCHEMA_WRAPPER = {
  name: 'riflett_main_reply',
  schema: RESPONSE_SCHEMA,
} as const

const STREAM_SYSTEM_PROMPT =
  'Respond as Riflett, an empathetic reflective partner. Provide grounded coaching that references context when helpful and stays actionable. Return only the user-facing reply text.'

function validateResponse(payload: any): asserts payload is MainChatAiResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI response missing payload')
  }
  ;(['reply', 'learned', 'ethical'] as const).forEach((key) => {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) {
      throw new Error(`AI response missing required string field: ${key}`)
    }
  })
}

const formatMatches = (matches: IntentPayload['memoryMatches']): string => {
  if (!Array.isArray(matches) || matches.length === 0) {
    return 'No prior memories matched.'
  }

  return matches
    .slice(0, 5)
    .map((match, index) => {
      const when = match.ts ? new Date(match.ts).toISOString() : 'unknown'
      return `[${index + 1}] ${when} (${match.kind}): ${match.text}`
    })
    .join('\n')
}

const buildUserPrompt = (args: {
  userText: string
  intent: IntentPayload
  planner?: PlannerResponse | null
}): string => {
  const { userText, intent, planner } = args

  const routedIntent = intent.routedIntent
  const contextBlock = intent.enriched.contextSnippets.join('\n---\n')
  const memoryBlock = formatMatches(intent.memoryMatches)
  const userConfig = JSON.stringify(intent.enriched.userConfig ?? {}, null, 2)

  const plannerSummary = planner
    ? `\n[PLAN]\nAction: ${planner.action}\nPayload: ${JSON.stringify(
        planner.payload ?? {},
        null,
        2
      )}\nClarify: ${planner.ask ?? 'null'}`
    : '\n[PLAN]\nAction: none (fallback to coaching response)'

  const decisionSummary =
    intent.decision.kind === 'commit'
      ? `Commit to ${intent.decision.primary}`
      : intent.decision.kind === 'clarify'
        ? `Clarify: ${intent.decision.question}`
        : 'Fallback mode'

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
`
}

type GenerateArgs = {
  userText: string
  intent: IntentPayload
  planner?: PlannerResponse | null
  apiKey?: string
  onToken?: (chunk: string) => void
}

export async function generateMainChatReply(args: GenerateArgs): Promise<MainChatAiResponse> {
  if (args.onToken) {
    try {
      const streamedReply = await streamReply(args, args.onToken)
      const structured = await requestStructuredResponse({ ...args, existingReply: streamedReply })
      return {
        reply: streamedReply,
        learned: structured.learned,
        ethical: structured.ethical,
      }
    } catch (error) {
      console.warn('[mainChat] streaming failed, falling back to non-streaming', error)
      const structured = await requestStructuredResponse(args)
      args.onToken(structured.reply)
      return structured
    }
  }

  return requestStructuredResponse(args)
}

async function requestStructuredResponse(
  args: GenerateArgs & { existingReply?: string }
): Promise<MainChatAiResponse> {
  const apiKey = resolveOpenAIApiKey(args.apiKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  const hasOverride = typeof args.existingReply === 'string'

  const systemPrompt = hasOverride
    ? 'You are Riflett’s analyst. Using the conversation context and the provided assistant reply, produce JSON containing the final reply (repeat it exactly), learned insights, and ethical notes.'
    : 'Respond as Riflett, an empathetic reflective partner. Provide grounded coaching and return JSON with reply, learned, and ethical fields.'

  const userPrompt = hasOverride
    ? `${buildUserPrompt(args)}

[ASSISTANT REPLY]
${args.existingReply}

Return JSON with fields "reply" (exactly the provided reply), "learned", and "ethical".`
    : `${buildUserPrompt(args)}

Return JSON with fields "reply", "learned", and "ethical".`

  const body = {
    model: MODEL_NAME,
    temperature: hasOverride ? 0.2 : 0.6,
    response_format: {
      type: 'json_schema',
      json_schema: JSON_SCHEMA_WRAPPER,
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      const message =
        response.status === 401
          ? 'AI request unauthorized. Check API key.'
          : `AI request failed (${response.status}).`
      console.warn('[mainChat] structured response error', response.status, errorText)
      throw new Error(message)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content

    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('AI response missing content')
    }

    const parsed = JSON.parse(content) as MainChatAiResponse
    validateResponse(parsed)

    if (hasOverride && args.existingReply) {
      return {
        reply: args.existingReply,
        learned: parsed.learned,
        ethical: parsed.ethical,
      }
    }

    return parsed
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('AI request timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function streamReply(
  args: GenerateArgs,
  onToken: (chunk: string) => void
): Promise<string> {
  const apiKey = resolveOpenAIApiKey(args.apiKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  const body = {
    model: MODEL_NAME,
    temperature: 0.6,
    stream: true,
    messages: [
      { role: 'system', content: STREAM_SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(args) },
    ],
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const message =
      response.status === 401
        ? 'AI request unauthorized. Check API key.'
        : `AI request failed (${response.status}).`
    console.warn('[mainChat] streaming error', response.status, errorText)
    throw new Error(message)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Streaming response unavailable')
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let reply = ''
  let doneStreaming = false

  try {
    while (!doneStreaming) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)

        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim()
          if (!payload) {
            newlineIndex = buffer.indexOf('\n')
            continue
          }
          if (payload === '[DONE]') {
            doneStreaming = true
            break
          }
          try {
            const parsed = JSON.parse(payload)
            const delta = parsed?.choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta.length > 0) {
              reply += delta
              onToken(delta)
            }
          } catch (error) {
            // Ignore malformed JSON chunks
          }
        }

        newlineIndex = buffer.indexOf('\n')
      }
    }
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      throw new Error('AI request timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }

  return reply.trim()
}
