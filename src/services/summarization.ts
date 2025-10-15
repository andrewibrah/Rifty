import Constants from 'expo-constants'
import { supabase } from '../lib/supabase'
import type {
  EntrySummary,
  CreateEntrySummaryParams,
  SummarizeEntryResult,
  GoalDetectionResult,
} from '../types/mvp'

const MODEL_NAME = 'gpt-4o-mini' as const

const getOpenAIKey = (): string => {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>
  const apiKey =
    extra?.openaiApiKey ||
    extra?.EXPO_PUBLIC_OPENAI_API_KEY ||
    extra?.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OpenAI API key is missing')
  }
  return apiKey
}

/**
 * Summarize an entry using OpenAI with structured extraction
 */
export async function summarizeEntry(
  content: string,
  entryType: string
): Promise<SummarizeEntryResult> {
  const apiKey = getOpenAIKey()
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 45000)

  const systemPrompt = `You are Riflett, a reflective coach. Analyze the user's entry and provide:
1. A 2-3 line summary (no fluff)
2. Core emotion (single word or phrase)
3. Topic tags (max 5, lowercase)
4. People mentioned (names only)
5. Urgency level (0-10)
6. One suggested next action
7. Any blockers mentioned
8. Dates/deadlines mentioned
9. A brief reflection (1-2 sentences, warm and constructive)

Entry type: ${entryType}`

  const tools = [
    {
      type: 'function',
      function: {
        name: 'emit_summary',
        description: 'Return structured summary and reflection for the entry',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'reflection'],
          properties: {
            summary: { type: 'string' },
            emotion: { type: 'string' },
            topics: { type: 'array', items: { type: 'string' } },
            people: { type: 'array', items: { type: 'string' } },
            urgency_level: { type: 'number', minimum: 0, maximum: 10 },
            suggested_action: { type: 'string' },
            blockers: { type: 'string' },
            dates_mentioned: { type: 'array', items: { type: 'string' } },
            reflection: { type: 'string' },
          },
        },
      },
    },
  ] as const

  const body = {
    model: MODEL_NAME,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    tools,
    tool_choice: { type: 'function', function: { name: 'emit_summary' } },
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.warn('[OpenAI Summarization] Error:', response.status, errorBody)
      throw new Error('Failed to summarize entry')
    }

    const data = await response.json()
    const msg = data?.choices?.[0]?.message
    const toolCall = msg?.tool_calls?.[0]
    const argStr: string | undefined = toolCall?.function?.arguments

    if (!argStr) {
      throw new Error('OpenAI response missing tool call')
    }

    const parsed = JSON.parse(argStr) as SummarizeEntryResult
    return parsed
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Summarization request timed out')
    }
    console.error('[OpenAI Summarization] Error:', error)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Detect if entry implies a goal
 */
export async function detectGoal(content: string): Promise<GoalDetectionResult> {
  const apiKey = getOpenAIKey()
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 30000)

  const systemPrompt = `Analyze if this entry implies a goal or objective. If yes, extract:
- Suggested title (short, actionable)
- Description (1-2 sentences)
- Category (health, relationships, career, creativity, etc.)
- 2-3 micro-steps to start

Respond with structured JSON.`

  const tools = [
    {
      type: 'function',
      function: {
        name: 'emit_goal_detection',
        description: 'Return goal detection result',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['goal_detected'],
          properties: {
            goal_detected: { type: 'boolean' },
            suggested_title: { type: 'string' },
            suggested_description: { type: 'string' },
            suggested_category: { type: 'string' },
            suggested_micro_steps: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  ] as const

  const body = {
    model: MODEL_NAME,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    tools,
    tool_choice: {
      type: 'function',
      function: { name: 'emit_goal_detection' },
    },
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.warn('[OpenAI Goal Detection] Error:', response.status, errorBody)
      // Return no goal detected on error
      return { goal_detected: false }
    }

    const data = await response.json()
    const msg = data?.choices?.[0]?.message
    const toolCall = msg?.tool_calls?.[0]
    const argStr: string | undefined = toolCall?.function?.arguments

    if (!argStr) {
      return { goal_detected: false }
    }

    const parsed = JSON.parse(argStr) as GoalDetectionResult
    return parsed
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn('[OpenAI Goal Detection] Timeout')
    } else {
      console.error('[OpenAI Goal Detection] Error:', error)
    }
    return { goal_detected: false }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Store entry summary in database
 */
export async function storeEntrySummary(
  params: CreateEntrySummaryParams
): Promise<EntrySummary> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('entry_summaries')
    .insert({
      entry_id: params.entry_id,
      user_id: user.id,
      summary: params.summary,
      emotion: params.emotion ?? null,
      topics: params.topics ?? [],
      people: params.people ?? [],
      urgency_level: params.urgency_level ?? null,
      suggested_action: params.suggested_action ?? null,
      blockers: params.blockers ?? null,
      dates_mentioned: params.dates_mentioned ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[storeEntrySummary] Error:', error)
    throw error
  }

  return data as EntrySummary
}

/**
 * Get entry summary by entry ID
 */
export async function getEntrySummary(
  entryId: string
): Promise<EntrySummary | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('entry_summaries')
    .select('*')
    .eq('entry_id', entryId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[getEntrySummary] Error:', error)
    throw error
  }

  return data as EntrySummary | null
}

/**
 * Get all summaries for a user
 */
export async function listEntrySummaries(options: {
  limit?: number
  before?: string
} = {}): Promise<EntrySummary[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const limit = options.limit ?? 50

  let query = supabase
    .from('entry_summaries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.before) {
    query = query.lt('created_at', options.before)
  }

  const { data, error } = await query

  if (error) {
    console.error('[listEntrySummaries] Error:', error)
    throw error
  }

  return (data ?? []) as EntrySummary[]
}
