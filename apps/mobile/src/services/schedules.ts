import { resolveOpenAIApiKey } from './ai'
import { supabase } from '../lib/supabase'
import { getOperatingPicture } from './memory'
import { generateUUID } from '../utils/id'

export interface ScheduleSuggestion {
  id: string
  title: string
  start: string
  end: string
  focus: string
  note?: string
}

export interface PersistedScheduleBlock {
  id: string
  user_id: string
  start_at: string
  end_at: string
  intent: string
  summary: string | null
  goal_id: string | null
  location: string | null
  attendees: string[]
  receipts: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface ScheduleBlockInput {
  start: string
  end: string
  intent: string
  goal_id?: string | null
  summary?: string | null
  location?: string | null
  attendees?: string[]
  receipts?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

interface SuggestionParams {
  date: string
  mood?: string | null
  existingBlocks?: string[]
}

interface SuggestedBlock {
  start: string
  end: string
  intent: string
  goal_id: string | null
  receipts: Record<string, unknown>
}

const resolveUserId = async (uid?: string | null): Promise<string> => {
  if (uid) {
    return uid
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error('User not authenticated')
  }
  return user.id
}

const toISOString = (value: Date): string => value.toISOString()

const hasConflict = (
  start: Date,
  end: Date,
  existing: Array<{ start_at: string; end_at: string | null }>
): boolean => {
  const startMs = start.getTime()
  const endMs = end.getTime()
  return existing.some((block) => {
    const blockStart = new Date(block.start_at).getTime()
    const blockEnd = block.end_at ? new Date(block.end_at).getTime() : blockStart
    return startMs < blockEnd && endMs > blockStart
  })
}

export async function persistScheduleBlock(
  uid: string | null,
  block: ScheduleBlockInput
): Promise<PersistedScheduleBlock> {
  if (!block.start || !block.end) {
    throw new Error('start and end timestamps are required')
  }

  const start = new Date(block.start)
  const end = new Date(block.end)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid start or end timestamp')
  }
  if (end.getTime() <= start.getTime()) {
    throw new Error('Schedule block end must be after start')
  }

  const userId = await resolveUserId(uid)

  const payload = {
    user_id: userId,
    start_at: toISOString(start),
    end_at: toISOString(end),
    intent: block.intent.trim(),
    summary: block.summary ?? null,
    goal_id: block.goal_id ?? null,
    location: block.location ?? null,
    attendees: Array.isArray(block.attendees) ? block.attendees : [],
    receipts: block.receipts ?? {},
    metadata: block.metadata ?? {},
  }

  const { data, error } = await supabase
    .from('schedule_blocks')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[schedules] persistScheduleBlock error', error)
    throw error
  }

  return data as PersistedScheduleBlock
}

export async function suggestBlocks(
  uid?: string | null,
  goalId?: string | null
): Promise<SuggestedBlock[]> {
  const userId = await resolveUserId(uid)

  const operatingPicture = await getOperatingPicture(userId)
  const cadenceProfile = operatingPicture!.cadence_profile
  const sessionMinutes = Math.max(
    20,
    Math.min(Number(cadenceProfile?.session_length_minutes ?? 45), 180)
  )

  const now = new Date()
  const horizon = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

  const { data: existingRows, error: existingError } = await supabase
    .from('schedule_blocks')
    .select('start_at, end_at')
    .eq('user_id', userId)
    .gte('start_at', toISOString(now))
    .lte('start_at', toISOString(horizon))

  if (existingError) {
    console.warn('[schedules] existing schedule lookup failed', existingError)
  }

  const existing = existingRows ?? []
  const suggestions: SuggestedBlock[] = []

  const candidateStarts: Date[] = []
  const base = new Date(now)
  base.setMinutes(0, 0, 0)
  base.setHours(base.getHours() + 1)

  for (let day = 0; day < 5 && candidateStarts.length < 6; day += 1) {
    for (const hour of [9, 13, 16]) {
      const candidate = new Date(base)
      candidate.setDate(base.getDate() + day)
      candidate.setHours(hour, 0, 0, 0)
      if (candidate <= now) {
        continue
      }
      candidateStarts.push(candidate)
      if (candidateStarts.length >= 6) {
        break
      }
    }
  }

  const durationMs = sessionMinutes * 60 * 1000
  const blockIntent = goalId ? 'goal.focus' : 'focus.block'

  for (const candidate of candidateStarts) {
    const end = new Date(candidate.getTime() + durationMs)
    if (hasConflict(candidate, end, existing)) {
      continue
    }

    const receipts = {
      cadence: cadenceProfile?.cadence ?? 'none',
      session_minutes: sessionMinutes,
      conflict_checked: true,
      timezone: cadenceProfile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      goal_context: goalId ?? null,
    }

    suggestions.push({
      start: toISOString(candidate),
      end: toISOString(end),
      intent: blockIntent,
      goal_id: goalId ?? null,
      receipts,
    })

    if (suggestions.length >= 3) {
      break
    }
  }

  return suggestions
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

Suggest up to three focused time blocks that align with the user's energy and priorities.
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
        id: generateUUID(),
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
