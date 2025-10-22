import { supabase } from '../lib/supabase'
import { generateEmbedding } from './embeddings'
import { getJournalEntryById, type RemoteJournalEntry } from './data'
import { getEntrySummary } from './summarization'
import type { UserFact, CreateUserFactParams, AnalystQueryResult } from '../types/mvp'
import type { ReflectionCadence } from '../types/personalization'
import Constants from 'expo-constants'

const MODEL_NAME = 'gpt-4o-mini' as const

const RAG_ENTRY_THRESHOLD = 0.45
const RAG_GOAL_THRESHOLD = 0.4
const RAG_MAX_RESULTS = 9
const RAG_MATCH_COUNT = 18

type RagKind = 'entry' | 'goal' | 'schedule'

export interface OperatingGoal {
  id: string
  title: string
  status: string
  priority_score: number
  target_date: string | null
  current_step: string | null
  micro_steps: string[]
  metadata: Record<string, unknown>
  updated_at: string
}

export interface OperatingEntry {
  id: string
  type: string
  summary: string
  created_at: string
  emotion?: string | null
  urgency_level?: number | null
  snippet: string
  metadata: Record<string, unknown>
}

export interface OperatingSchedule {
  id: string
  intent: string | null
  summary: string | null
  start_at: string
  end_at: string
  goal_id: string | null
  location: string | null
  attendees: string[]
  receipts: Record<string, unknown>
}

export interface CadenceProfile {
  cadence: ReflectionCadence
  session_length_minutes: number
  last_message_at: string | null
  missed_day_count: number
  current_streak: number
  timezone: string
}

export interface OperatingPicture {
  why_model: Record<string, unknown> | null
  top_goals: OperatingGoal[]
  hot_entries: OperatingEntry[]
  next_72h: OperatingSchedule[]
  cadence_profile: CadenceProfile
  risk_flags: string[]
}

export interface RagResult {
  id: string
  kind: RagKind
  score: number
  title?: string
  snippet: string
  metadata: Record<string, unknown>
}

export interface PersistedFactInput {
  key: string
  value: unknown
  confidence?: number
  tags?: string[]
  source?: string
}

interface EntryMatch {
  entry_id: string
  similarity: number
}

interface GoalMatch {
  goal_id: string
  similarity: number
  title?: string | null
  status?: string | null
}

const CADENCE_VALUES: ReflectionCadence[] = ['none', 'daily', 'weekly']
const safeQuery = async <T>(query: Promise<{ data: T; error: any }>): Promise<{ data: T | null; error: any }> => { try { return await query } catch (e) { return { data: null, error: e } } }
const isReflectionCadence = (value: unknown): value is ReflectionCadence =>
  typeof value === 'string' && CADENCE_VALUES.includes(value as ReflectionCadence)


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

const nowIso = () => new Date().toISOString()

const resolveUserId = async (uid?: string): Promise<string | null> => {
  if (uid) return uid
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) {
    console.warn('[memory] resolveUserId failed', error)
    return null
  }
  return user?.id ?? null
}

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : null))
      .filter((item): item is string => item !== null)
  }
  return []
}

const normalizeMetadata = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const computeTokenScore = (query: string, text: string): number => {
  const trimmedQuery = query.trim().toLowerCase()
  const trimmedText = text.trim().toLowerCase()
  if (!trimmedQuery || !trimmedText) return 0
  const queryTokens = trimmedQuery.split(/[^a-z0-9]+/i).filter(Boolean)
  const textTokens = trimmedText.split(/[^a-z0-9]+/i).filter(Boolean)
  if (!queryTokens.length || !textTokens.length) return 0
  const querySet = new Set(queryTokens)
  let overlap = 0
  for (const token of textTokens) {
    if (querySet.has(token)) {
      overlap += 1
    }
  }
  return overlap / querySet.size
}

export async function getOperatingPicture(
  uid?: string
): Promise<OperatingPicture> {
  const userId = await resolveUserId(uid)
  if (!userId) {
    throw new Error('User not authenticated')
  }

  const now = new Date()
  const future = new Date(now.getTime() + 72 * 60 * 60 * 1000)

  const featureRes = await (async () => { try { return await supabase.from('features').select('key, value_json').eq('user_id', userId).in('key', ['why_model', 'risk_flags', 'cadence_profile']) } catch (e) { return { data: null, error: e } } })(); await Promise.allSettled([
    await Promise.all([
      safeQuery(supabase
        .from('features')
        .select('key, value_json')
        .eq('user_id', userId)
        .in('key', ['why_model', 'risk_flags', 'cadence_profile']),
      safeQuery(supabase
        .from('mv_goal_priority')
        .select(
          `goal_id, priority_score, goals!inner(
            id,
            title,
            status,
            current_step,
            micro_steps,
            metadata,
            updated_at,
            target_date
          )`
        )
        .eq('user_id', userId)
        .order('priority_score', { ascending: false })
        .limit(3),
      safeQuery(supabase
        .from('entry_summaries')
        .select(
          `entry_id,
           summary,
           emotion,
           urgency_level,
           entries!inner(id, type, content, metadata, created_at)`
        )
        .eq('user_id', userId)
        .order('urgency_level', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(6),
      safeQuery(supabase
        .from('schedule_blocks')
        .select(
          'id, intent, summary, start_at, end_at, goal_id, location, attendees, receipts'
        )
        .eq('user_id', userId)
        .gte('start_at', now.toISOString())
        .lte('start_at', future.toISOString())
        .order('start_at', { ascending: true })
        .limit(6),
      safeQuery(supabase
        .from('user_settings')
        .select('cadence, session_length_minutes')
        .eq('user_id', userId)
        .maybeSingle())
      safeQuery(supabase
        .from('profiles')
        .select('timezone, missed_day_count, current_streak, last_message_at')
        .eq('id', userId)
        .maybeSingle())
    ])

  if (featureRes.error) {
    console.warn('[memory] feature fetch failed', featureRes.error)
  }
  if (goalsRes.error) {
    console.warn('[memory] goal snapshot fetch failed', goalsRes.error)
  }
  if (entryRes.error) {
    console.warn('[memory] entry snapshot fetch failed', entryRes.error)
  }
  if (scheduleRes.error) {
    console.warn('[memory] schedule snapshot fetch failed', scheduleRes.error)
  }
  if (settingsRes.error) {
    console.warn('[memory] cadence settings fetch failed', settingsRes.error)
  }
  if (profileRes.error) {
    console.warn('[memory] profile snapshot fetch failed', profileRes.error)
  }

  const featureMap = (featureRes.data ?? []).reduce<Record<string, unknown>>(
    (acc, row) => {
      if (row?.key) {
        acc[row.key] = row.value_json ?? {}
      }
      return acc
    },
    {}
  )

  const whyModel =
    featureMap.why_model && typeof featureMap.why_model === 'object'
      ? (featureMap.why_model as Record<string, unknown>)
      : null

  const cadenceOverride =
    featureMap.cadence_profile && typeof featureMap.cadence_profile === 'object'
      ? (featureMap.cadence_profile as Record<string, unknown>)
      : null

  const riskFlags = normalizeStringArray(featureMap.risk_flags)

  const topGoals: OperatingGoal[] = (goalsRes.data ?? [])
    .map((row) => {
      const goal = (row as Record<string, any>).goals as Record<string, any> | undefined
      if (!goal) return null
      return {
        id: String(goal.id),
        title: String(goal.title ?? 'Untitled goal'),
        status: String(goal.status ?? 'active'),
        priority_score: Number(row.priority_score ?? 0),
        target_date: goal.target_date ?? null,
        current_step: goal.current_step ?? null,
        micro_steps: normalizeStringArray(goal.micro_steps),
        metadata: normalizeMetadata(goal.metadata),
        updated_at: goal.updated_at ?? nowIso(),
      }
    })
    .filter((goal): goal is OperatingGoal => goal !== null)

  const hotEntries: OperatingEntry[] = (entryRes.data ?? [])
    .map((row) => {
      const entry = (row as Record<string, any>).entries as Record<string, any> | undefined
      if (!entry) return null
      const content = typeof entry.content === 'string' ? entry.content : ''
      const snippet = content.slice(0, 220)
      const operatingEntry: OperatingEntry = {
        id: String(entry.id),
        type: String(entry.type ?? 'journal'),
        summary: typeof row.summary === 'string' ? row.summary : snippet,
        created_at: String(entry.created_at ?? nowIso()),
        emotion: typeof row.emotion === 'string' ? row.emotion : null,
        urgency_level:
          typeof row.urgency_level === 'number' ? row.urgency_level : null,
        snippet,
        metadata: normalizeMetadata(entry.metadata),
      }
      return operatingEntry
    })
    .filter((entry): entry is OperatingEntry => entry !== null)
    .slice(0, 3)

  const nextBlocks: OperatingSchedule[] = (scheduleRes.data ?? [])
    .map((row) => ({
      id: String(row.id),
      intent: row.intent ?? null,
      summary: row.summary ?? null,
      start_at: row.start_at ?? nowIso(),
      end_at: row.end_at ?? row.start_at ?? nowIso(),
      goal_id: row.goal_id ?? null,
      location: row.location ?? null,
      attendees: Array.isArray(row.attendees)
        ? (row.attendees as string[])
        : [],
      receipts: normalizeMetadata(row.receipts),
    }))
    .slice(0, 5)

  const cadenceValue =
    cadenceOverride?.cadence && isReflectionCadence(cadenceOverride.cadence)
      ? cadenceOverride.cadence
      : settingsRes.data?.cadence && isReflectionCadence(settingsRes.data.cadence)
      ? settingsRes.data.cadence
      : 'none'

  const sessionLength =
    Number(settingsRes.data?.session_length_minutes ?? cadenceOverride?.session_length_minutes ?? 25) || 25

  const profile = (profileRes.data ?? null) as
    | {
        timezone?: string | null
        missed_day_count?: number | null
        current_streak?: number | null
        last_message_at?: string | null
      }
    | null
  const cadenceProfile: CadenceProfile = {
    cadence: cadenceValue,
    session_length_minutes: sessionLength,
    last_message_at: profile?.last_message_at ?? null,
    missed_day_count: Number(profile?.missed_day_count ?? 0),
    current_streak: Number(profile?.current_streak ?? 0),
    timezone:
      profile?.timezone && typeof profile.timezone === 'string'
        ? profile.timezone
        : 'UTC',
  }

  return {
    why_model: whyModel,
    top_goals: topGoals,
    hot_entries: hotEntries,
    next_72h: nextBlocks,
    cadence_profile: cadenceProfile,
    risk_flags: riskFlags,
  }
}

type RagScopeInput = RagKind | RagKind[] | 'all'

const scopeToKinds = (scope: RagScopeInput): RagKind[] => {
  if (!scope || scope === 'all') {
    return ['entry', 'goal', 'schedule']
  }
  if (Array.isArray(scope)) {
    return Array.from(new Set(scope))
      .filter((kind): kind is RagKind => kind === 'entry' || kind === 'goal' || kind === 'schedule')
  }
  if (scope === 'entry' || scope === 'goal' || scope === 'schedule') {
    return [scope]
  }
  return ['entry', 'goal', 'schedule']
}

const mapEntryResults = (
  matches: EntryMatch[] | null | undefined,
  details: Record<string, any>
): RagResult[] => {
  if (!Array.isArray(matches)) return []
  return matches.reduce<RagResult[]>((acc, match) => {
    const entry = details[match.entry_id]
    if (!entry) return acc
    const firstSummary = Array.isArray(entry.entry_summaries)
      ? entry.entry_summaries[0]
      : undefined
    const summary =
      typeof firstSummary?.summary === 'string'
        ? firstSummary.summary
        : ''
    const snippetSource = summary || (typeof entry.content === 'string' ? entry.content : '')
    const title = typeof entry.type === 'string' && entry.type
      ? `${entry.type} entry`
      : null

    const result: RagResult = {
      id: match.entry_id,
      kind: 'entry',
      score: 0.7 * Number(match.similarity ?? 0) + 0.3 * computeTokenScore(query, snippetSource),
      snippet: snippetSource.slice(0, 220),
      metadata: {
        created_at: entry.created_at ?? null,
        type: entry.type ?? null,
        emotion: firstSummary?.emotion ?? null,
        urgency_level: firstSummary?.urgency_level ?? null,
      },
    }
    if (title) {
      result.title = title
    }
    acc.push(result)
    return acc
  }, [])
}

const mapGoalResults = (
  matches: GoalMatch[] | null | undefined,
  details: Record<string, any>
): RagResult[] => {
  if (!Array.isArray(matches)) return []
  return matches.reduce<RagResult[]>((acc, match) => {
    const goal = details[match.goal_id]
    if (!goal) return acc
    const snippetSource =
      typeof goal.description === 'string'
        ? goal.description
        : goal.current_step
        ? String(goal.current_step)
        : Array.isArray(goal.micro_steps)
        ? goal.micro_steps.join(' → ')
        : String(goal.title ?? 'Goal')
    const result: RagResult = {
      id: match.goal_id,
      kind: 'goal',
      score: 0.7 * Number(match.similarity ?? 0) + 0.3 * computeTokenScore(query, snippetSource),
      title: typeof goal.title === 'string' ? goal.title : match.title ?? 'Goal',
      snippet: snippetSource.slice(0, 220),
      metadata: {
        status: goal.status ?? match.status ?? null,
        current_step: goal.current_step ?? null,
        micro_steps: goal.micro_steps ?? [],
        updated_at: goal.updated_at ?? null,
      },
    }
    acc.push(result)
    return acc
  }, [])
}

interface ScheduleRow {
  id: string
  intent?: string | null
  summary?: string | null
  start_at?: string | null
  end_at?: string | null
  goal_id?: string | null
  location?: string | null
  attendees?: string[] | null
}

const mapScheduleResults = (rows: ScheduleRow[], query: string): RagResult[] => {
  if (!Array.isArray(rows) || !query) return []
  return rows.reduce<RagResult[]>((acc, row) => {
    const text = [row.summary, row.intent, row.location]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
    const score = computeTokenScore(query, text)
    if (score <= 0) {
      return acc
    }
    const snippetSource =
      typeof row.summary === 'string'
        ? row.summary
        : typeof row.intent === 'string'
        ? row.intent
        : 'Scheduled block'
    const result: RagResult = {
      id: String(row.id),
      kind: 'schedule',
      score,
      title: typeof row.intent === 'string' ? row.intent : 'Schedule block',
      snippet: snippetSource,
      metadata: {
        start_at: row.start_at ?? null,
        end_at: row.end_at ?? null,
        location: row.location ?? null,
        attendees: Array.isArray(row.attendees) ? row.attendees : [],
        goal_id: row.goal_id ?? null,
      },
    }
    acc.push(result)
    return acc
  }, [])
}

export async function ragSearch(
  uid: string,
  query: string,
  scope: RagScopeInput = 'all',
  options: { limit?: number } = {}
): Promise<RagResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const userId = await resolveUserId(uid)
  if (!userId) {
    throw new Error('User not authenticated')
  }

  let queryEmbedding: number[]
  try {
    queryEmbedding = await generateEmbedding(trimmed)
  } catch (error) {
    console.warn('[memory] ragSearch embedding failed', error)
    return []
  }

  const kinds = scopeToKinds(scope)
  const limit = Math.max(1, Math.min(options.limit ?? 8, RAG_MAX_RESULTS))

  const results: RagResult[] = []

  if (kinds.includes('entry')) {
    const { data: entryMatchData, error: entryMatchError } = await supabase.rpc(
      'match_entry_embeddings',
      {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_threshold: RAG_ENTRY_THRESHOLD,
        match_count: RAG_MATCH_COUNT,
      }
    )

    if (entryMatchError) {
      console.warn('[memory] entry match failed', entryMatchError)
    } else {
      const entryMatches = (entryMatchData ?? []) as EntryMatch[]
      if (entryMatches.length) {
        const entryIds = entryMatches
          .map((match) => match.entry_id)
          .filter((id): id is string => typeof id === 'string')

        if (entryIds.length) {
          const { data: entryDetails, error: entryDetailError } = await supabase
            .from('entries')
            .select(
              'id, type, content, metadata, created_at, entry_summaries(summary, emotion, urgency_level)'
            )
            .in('id', entryIds)

          if (entryDetailError) {
            console.warn('[memory] entry detail fetch failed', entryDetailError)
          } else {
            const entryMap = (entryDetails ?? []).reduce<Record<string, any>>(
              (acc, row) => {
                const id = typeof row.id === 'string' ? row.id : null
                if (id) {
                  acc[id] = row
                }
                return acc
              },
              {}
            )
            results.push(...mapEntryResults(entryMatches, entryMap, trimmed))
          }
        }
      }
    }
  }

  if (kinds.includes('goal')) {
    const { data: goalMatchData, error: goalMatchError } = await supabase.rpc(
      'match_goal_embeddings',
      {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_threshold: RAG_GOAL_THRESHOLD,
        match_count: RAG_MATCH_COUNT,
      }
    )

    if (goalMatchError) {
      console.warn('[memory] goal match failed', goalMatchError)
    } else {
      const goalMatches = (goalMatchData ?? []) as GoalMatch[]
      if (goalMatches.length) {
        const goalIds = goalMatches
          .map((match) => match.goal_id)
          .filter((id): id is string => typeof id === 'string')

        if (goalIds.length) {
          const { data: goalDetails, error: goalDetailError } = await supabase
            .from('goals')
            .select(
              'id, title, status, current_step, micro_steps, metadata, updated_at, description'
            )
            .in('id', goalIds)

          if (goalDetailError) {
            console.warn('[memory] goal detail fetch failed', goalDetailError)
          } else {
            const goalMap = (goalDetails ?? []).reduce<Record<string, any>>(
              (acc, row) => {
                const id = typeof row.id === 'string' ? row.id : null
                if (id) {
                  acc[id] = row
                }
                return acc
              },
              {}
            )
            results.push(...mapGoalResults(goalMatches, goalMap, trimmed))
          }
        }
      }
    }
  }

  if (kinds.includes('schedule')) {
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from('schedule_blocks')
      .select(
        'id, intent, summary, start_at, end_at, goal_id, location, attendees'
      )
      .eq('user_id', userId)
      .order('start_at', { ascending: true })
      .limit(15)

    if (scheduleError) {
      console.warn('[memory] schedule search fetch failed', scheduleError)
    } else {
      const scheduleData = (scheduleRows ?? []) as ScheduleRow[]
      results.push(...mapScheduleResults(scheduleData, trimmed))
    }
  }

  const sorted = results.sort((a, b) => b.score - a.score)
  const maxPerKind = Math.max(1, Math.ceil(limit / Math.max(1, kinds.length)))
  const counts = new Map<RagKind, number>()
  const deduped: RagResult[] = []

  for (const item of sorted) {
    if (deduped.find((existing) => existing.id === item.id)) {
      continue
    }
    const currentCount = counts.get(item.kind) ?? 0
    if (currentCount >= maxPerKind) {
      continue
    }
    deduped.push(item)
    counts.set(item.kind, currentCount + 1)
    if (deduped.length >= limit) {
      break
    }
  }

  return deduped.slice(0, limit)
}

export async function persistUserFacts(
  uid: string | null,
  facts: PersistedFactInput[]
): Promise<void> {
  if (!Array.isArray(facts) || facts.length === 0) {
    return
  }

  const userId = await resolveUserId(uid ?? undefined)
  if (!userId) {
    throw new Error('User not authenticated')
  }

  const rows = facts
    .filter((fact) => fact && typeof fact.key === 'string' && fact.key.trim())
    .map((fact) => ({
      user_id: userId,
      key: fact.key.trim().startsWith('facts:')
        ? fact.key.trim()
        : `facts:${fact.key.trim()}`,
      value_json: {
        value: fact.value ?? null,
        confidence: fact.confidence ?? null,
        tags: Array.isArray(fact.tags) ? fact.tags : [],
        source: fact.source ?? 'main.chat',
        updated_at: nowIso(),
      },
      updated_at: nowIso(),
    }))

  if (!rows.length) {
    return
  }

  const { error } = await safeQuery(supabase
    .from('features')
    .upsert(rows, { onConflict: 'user_id,key' })

  if (error) {
    console.error('[memory] persistUserFacts failed', error)
    throw error
  }
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
  const userId = await resolveUserId()
  if (!userId) {
    throw new Error('User not authenticated')
  }

  const limit = options.limit ?? 5
  const ragEntries = await ragSearch(userId, query, 'entry', { limit })

  const entriesWithContext = await Promise.all(
    ragEntries.map(async (item) => {
      const entry = await getJournalEntryById(item.id)
      const summary = await getEntrySummary(item.id)
      if (!entry) return null
      return {
        entry,
        summary: summary?.summary ?? item.snippet,
        similarity: item.score,
      }
    })
  )

  const validEntries = entriesWithContext.filter(
    (value): value is NonNullable<typeof value> => value !== null
  )

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

  const { error } = await safeQuery(supabase
    .from('user_facts')
    .delete()
    .eq('id', factId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[deleteUserFact] Error:', error)
    throw error
  }
}
