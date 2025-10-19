import { supabase } from '../lib/supabase'

export interface AtomicMomentInput {
  entryId?: string | null
  messageId?: string | null
  sessionId?: string | null
  content: string
  tags?: string[]
  importanceScore?: number
  metadata?: Record<string, any>
}

export interface AtomicMomentRecord {
  id: string
  user_id: string
  entry_id: string | null
  message_id: string | null
  session_id: string | null
  content: string
  tags: string[]
  importance_score: number
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  if (!user) throw new Error('User not authenticated')
  return user.id
}

export async function createAtomicMoment(payload: AtomicMomentInput): Promise<AtomicMomentRecord> {
  const userId = await requireUserId()

  const { data, error } = await supabase
    .from('atomic_moments')
    .insert({
      user_id: userId,
      entry_id: payload.entryId ?? null,
      message_id: payload.messageId ?? null,
      session_id: payload.sessionId ?? null,
      content: payload.content,
      tags: payload.tags ?? [],
      importance_score: payload.importanceScore ?? 5,
      metadata: payload.metadata ?? {},
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as AtomicMomentRecord
}

export async function updateAtomicMoment(
  id: string,
  updates: Partial<Omit<AtomicMomentInput, 'content'>> & { content?: string }
): Promise<AtomicMomentRecord> {
  await requireUserId()

  const payload: Record<string, any> = {}

  if (updates.entryId !== undefined) payload.entry_id = updates.entryId
  if (updates.messageId !== undefined) payload.message_id = updates.messageId
  if (updates.sessionId !== undefined) payload.session_id = updates.sessionId
  if (updates.content !== undefined) payload.content = updates.content
  if (updates.tags !== undefined) payload.tags = updates.tags
  if (updates.importanceScore !== undefined) payload.importance_score = updates.importanceScore
  if (updates.metadata !== undefined) payload.metadata = updates.metadata

  const { data, error } = await supabase
    .from('atomic_moments')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as AtomicMomentRecord
}

export async function deleteAtomicMoment(id: string): Promise<void> {
  await requireUserId()
  const { error } = await supabase.from('atomic_moments').delete().eq('id', id)
  if (error) throw error
}

export async function searchAtomicMoments(options: {
  query?: string
  limit?: number
  tags?: string[]
} = {}): Promise<AtomicMomentRecord[]> {
  const userId = await requireUserId()
  const limit = options.limit ?? 50

  let queryBuilder = supabase
    .from('atomic_moments')
    .select('*')
    .eq('user_id', userId)
    .order('importance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.tags && options.tags.length > 0) {
    queryBuilder = queryBuilder.contains('tags', options.tags)
  }

  const { data, error } = await queryBuilder
  if (error) throw error

  const records = (data ?? []) as AtomicMomentRecord[]
  if (!options.query || options.query.trim().length === 0) {
    return records
  }

  const q = options.query.toLowerCase()
  return records.filter((record) => record.content.toLowerCase().includes(q))
}

export async function listAtomicMomentsForEntry(
  entryId: string,
  options: { limit?: number } = {}
): Promise<AtomicMomentRecord[]> {
  const userId = await requireUserId()
  const limit = options.limit ?? 20

  const { data, error } = await supabase
    .from('atomic_moments')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_id', entryId)
    .order('importance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as AtomicMomentRecord[]
}
