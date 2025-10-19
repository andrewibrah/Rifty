import type { ChatMessage } from '../types/chat'
import { resolveOpenAIApiKey } from './ai'

const MODEL_NAME = 'gpt-4o-mini' as const

export interface SessionMetadataResult {
  title: string
  summary: string
  confidence: number
}

interface BuildTranscriptParams {
  messages: ChatMessage[]
  maxMessages?: number
}

function buildTranscript({ messages, maxMessages = 24 }: BuildTranscriptParams): string {
  const recent = messages.slice(-maxMessages)
  return recent
    .map((message) => {
      const speaker = message.kind === 'bot' ? 'Coach' : 'User'
      return `${speaker}: ${message.content}`
    })
    .join('\n')
}

const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'emit_session_metadata',
    description: 'Generate a short session title, warm summary, and confidence score (0-1).',
    parameters: {
      type: 'object',
      required: ['title', 'summary', 'confidence'],
      additionalProperties: false,
      properties: {
        title: {
          type: 'string',
          description: '3-6 word evocative title capturing the theme of the conversation.',
        },
        summary: {
          type: 'string',
          description: 'One or two sentence highlight of what mattered most.',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Model confidence (0-1) that the title reflects the conversation.',
        },
      },
    },
  },
} as const

export async function generateSessionMetadata(
  messages: ChatMessage[]
): Promise<SessionMetadataResult> {
  const transcript = buildTranscript({ messages })

  if (!transcript.trim()) {
    return {
      title: 'Fresh Start',
      summary: 'Session began without prior messages.',
      confidence: 0.3,
    }
  }

  const apiKey = resolveOpenAIApiKey()
  const systemPrompt = `You create reflective session metadata for Riflett, an empathetic coach.
Return thoughtful, caring language with a concise title and summary.`

  const body = {
    model: MODEL_NAME,
    temperature: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Conversation transcript (chronological):\n${transcript}\n\nEmit title + summary + confidence.`,
      },
    ],
    tools: [TOOL_DEFINITION],
    tool_choice: { type: 'function', function: { name: 'emit_session_metadata' } },
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.warn('[sessionMetadata] OpenAI error', response.status, errorText)
      throw new Error('Failed to generate session metadata')
    }

    const data = await response.json()
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0]
    const argsString: string | undefined = toolCall?.function?.arguments

    if (!argsString) {
      throw new Error('Session metadata missing tool call arguments')
    }

    const parsed = JSON.parse(argsString) as SessionMetadataResult
    return {
      title: parsed.title?.trim() || 'Reflection',
      summary: parsed.summary?.trim() || 'Conversation summary unavailable.',
      confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : 0.5,
    }
  } catch (error) {
    console.warn('[sessionMetadata] Falling back to heuristic title', error)
    const fallbackSource = messages.find((msg) => msg.kind !== 'bot') ?? messages[0]
    const snippet = fallbackSource?.content?.slice(0, 48) ?? 'New reflections'
    return {
      title: snippet.length > 3 ? snippet : 'Reflection Burst',
      summary: 'Conversation summary unavailable due to network error.',
      confidence: 0.2,
    }
  }
}
