import { resolveOpenAIApiKey } from './ai'

export interface ScheduleSuggestion {
  title: string
  start: string
  end: string
  focus: string
  note?: string
}

interface SuggestionParams {
  date: string
  mood?: string | null
  existingBlocks?: string[]
}

const MODEL_NAME = 'gpt-4o-mini'

const SUGGESTION_SCHEMA = {
  name: 'riflett_schedule_suggestions',
  schema: {
    type: 'object',
    required: ['suggestions'],
    additionalProperties: false,
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title', 'start', 'end', 'focus'],
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            start: { type: 'string', description: 'ISO 8601 timestamp' },
            end: { type: 'string', description: 'ISO 8601 timestamp' },
            focus: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
  },
} as const

export async function suggestScheduleBlocks(
  params: SuggestionParams
): Promise<ScheduleSuggestion[]> {
  const apiKey = resolveOpenAIApiKey()

  const existingSummary = (params.existingBlocks ?? [])
    .map((block, idx) => `- [${idx + 1}] ${block}`)
    .join('\n')

  const moodLine = params.mood ? `Current mood: ${params.mood}.` : ''

  const prompt = `Date: ${params.date}
${moodLine}
Existing commitments:
${existingSummary || 'None'}

Suggest up to three focused time blocks that align with the user\'s energy and priorities.
Output ISO timestamps and keep recommendations concise.`

  const body = {
    model: MODEL_NAME,
    temperature: 0.4,
    response_format: {
      type: 'json_schema',
      json_schema: SUGGESTION_SCHEMA,
    },
    messages: [
      {
        role: 'system',
        content:
          'You are Riflett, a caring coach who proposes realistic time blocks. Suggest deeply considerate focus/renewal sessions informed by mood and existing commitments.',
      },
      { role: 'user', content: prompt },
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
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.warn('[scheduleSuggestions] model error', response.status, errorText)
      throw new Error('Failed to generate schedule suggestions')
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error('Suggestion response missing content')
    }

    const parsed = JSON.parse(content) as { suggestions?: ScheduleSuggestion[] }
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : []

    return suggestions.map((item) => {
      const base: ScheduleSuggestion = {
        title: item.title?.trim() ?? 'Focus Block',
        start: item.start,
        end: item.end,
        focus: item.focus?.trim() ?? 'Deep work',
      }
      const note = item.note?.trim()
      if (note) {
        base.note = note
      }
      return base
    })
  } catch (error) {
    console.error('[scheduleSuggestions] failed', error)
    throw error
  }
}
