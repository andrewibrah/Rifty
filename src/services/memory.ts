import { supabase } from '../lib/supabase'
import { findSimilarEntries } from './embeddings'
import { getJournalEntryById, type RemoteJournalEntry } from './data'
import { getEntrySummary } from './summarization'
import type { UserFact, CreateUserFactParams, AnalystQueryResult } from '../types/mvp'
import Constants from 'expo-constants'

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
 * Build context for RAG: fetch relevant entries + summaries + user facts
 */
export async function buildRAGContext(
  query: string,
  options: { limit?: number; threshold?: number } = {}
): Promise<{
  entries: Array<{ entry: RemoteJournalEntry; summary: string; similarity: number }>
  facts: UserFact[]
}> {
  // Find similar entries using embeddings
  const similarEntries = await findSimilarEntries(query, {
    limit: options.limit ?? 5,
    threshold: options.threshold ?? 0.7,
  })

  // Fetch entry details and summaries
  const entriesWithContext = await Promise.all(
    similarEntries.map(async (sim) => {
      const entry = await getJournalEntryById(sim.entry_id)
      const summary = await getEntrySummary(sim.entry_id)

      if (!entry) return null

      return {
        entry,
        summary: summary?.summary ?? entry.content.slice(0, 200),
        similarity: sim.similarity,
      }
    })
  )

  const validEntries = entriesWithContext.filter(
    (e): e is NonNullable<typeof e> => e !== null
  )

  // Fetch relevant user facts
  const facts = await listUserFacts({ limit: 10 })

  return { entries: validEntries, facts }
}

/**
 * Answer an analyst query using RAG
 */
export async function answerAnalystQuery(query: string): Promise<AnalystQueryResult> {
  const apiKey = getOpenAIKey()
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 45000)

  // Build context
  const { entries, facts } = await buildRAGContext(query)

  // Format context for prompt
  const entryContext = entries
    .map(
      (e, idx) =>
        `[${idx + 1}] ${new Date(e.entry.created_at).toLocaleDateString()} (${
          e.entry.type
        }):\n${e.summary}`
    )
    .join('\n\n')

  const factsContext = facts.map((f) => `- ${f.fact}`).join('\n')

  const systemPrompt = `You are Riflett, an analyst for the user's journal. Answer questions about their entries with:
- Patterns and insights
- Direct citations (reference entry dates)
- Concise, actionable answers (fit on one screen)
- Empathy and warmth

Context will include relevant past entries and learned facts about the user.`

  const userPrompt = `Question: ${query}

Relevant Entries:
${entryContext || 'No relevant entries found.'}

Known Facts:
${factsContext || 'No facts yet.'}

Answer the question, citing specific entries by date.`

  const tools = [
    {
      type: 'function',
      function: {
        name: 'emit_answer',
        description: 'Return answer with citations',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['answer'],
          properties: {
            answer: { type: 'string' },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  entry_id: { type: 'string' },
                  date: { type: 'string' },
                  snippet: { type: 'string' },
                },
              },
            },
            relevant_facts: { type: 'array', items: { type: 'string' } },
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
      { role: 'user', content: userPrompt },
    ],
    tools,
    tool_choice: { type: 'function', function: { name: 'emit_answer' } },
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
      console.warn('[OpenAI Analyst Query] Error:', response.status, errorBody)
      throw new Error('Failed to answer query')
    }

    const data = await response.json()
    const msg = data?.choices?.[0]?.message
    const toolCall = msg?.tool_calls?.[0]
    const argStr: string | undefined = toolCall?.function?.arguments

    if (!argStr) {
      throw new Error('OpenAI response missing tool call')
    }

    const parsed = JSON.parse(argStr) as AnalystQueryResult
    return parsed
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Query request timed out')
    }
    console.error('[OpenAI Analyst Query] Error:', error)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Create a user fact
 */
export async function createUserFact(params: CreateUserFactParams): Promise<UserFact> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('user_facts')
    .insert({
      user_id: user.id,
      fact: params.fact,
      category: params.category ?? null,
      confidence: params.confidence ?? 0.8,
      source_entry_ids: params.source_entry_ids ?? [],
    })
    .select()
    .single()

  if (error) {
    console.error('[createUserFact] Error:', error)
    throw error
  }

  return data as UserFact
}

/**
 * List user facts
 */
export async function listUserFacts(options: {
  limit?: number
  category?: string
} = {}): Promise<UserFact[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const limit = options.limit ?? 50

  let query = supabase
    .from('user_facts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.category) {
    query = query.eq('category', options.category)
  }

  const { data, error } = await query

  if (error) {
    console.error('[listUserFacts] Error:', error)
    throw error
  }

  return (data ?? []) as UserFact[]
}

/**
 * Update a user fact
 */
export async function updateUserFact(
  factId: string,
  updates: { fact?: string; confidence?: number; last_confirmed_at?: string }
): Promise<UserFact> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('user_facts')
    .update(updates)
    .eq('id', factId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('[updateUserFact] Error:', error)
    throw error
  }

  return data as UserFact
}

/**
 * Delete a user fact
 */
export async function deleteUserFact(factId: string): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('user_facts')
    .delete()
    .eq('id', factId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[deleteUserFact] Error:', error)
    throw error
  }
}
