import { supabase } from '../lib/supabase'

type Nullable<T> = T | null

export type MessageRole = 'system' | 'user' | 'assistant'

export type RemoteMessage = {
  id: string
  conversation_id: string
  user_id: string
  role: MessageRole
  content: string
  metadata: Nullable<Record<string, any>>
  created_at: string
}

export type EntryType = 'journal' | 'goal' | 'schedule'

export type RemoteJournalEntry = {
  id: string
  user_id: string
  type: EntryType
  content: string
  metadata: Nullable<Record<string, any>>
  created_at: string
  updated_at?: string
  ai_intent?: Nullable<string>
  ai_confidence?: Nullable<number>
  ai_meta?: Nullable<Record<string, any>>
  source?: Nullable<string>
  mood?: Nullable<string>
  feeling_tags?: string[]
  linked_moments?: string[]
}

export async function listMessages(
  conversationId: string,
  options: { limit?: number; before?: string } = {}
): Promise<RemoteMessage[]> {
  const user = await requireUser()
  const limit = options.limit ?? 100

  let query = supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.before) {
    query = query.lt('created_at', options.before)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  const items = (data ?? []) as RemoteMessage[]
  return items.sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

export async function appendMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  metadata?: Record<string, any>
): Promise<RemoteMessage> {
  const user = await requireUser()

  const payload = {
    conversation_id: conversationId,
    user_id: user.id,
    role,
    content,
    metadata: metadata ?? null,
  }

  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as RemoteMessage
}

export async function listJournals(
  options: { limit?: number; before?: string; type?: EntryType } = {}
): Promise<RemoteJournalEntry[]> {
  const user = await requireUser()
  const limit = options.limit ?? 50

  let query = supabase
    .from('entries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.before) {
    query = query.lt('created_at', options.before)
  }

  if (options.type) {
    query = query.eq('type', options.type)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []) as RemoteJournalEntry[]
}

export async function createJournalEntry(params: {
  type: EntryType
  content: string
  metadata?: Record<string, any>
  mood?: string | null
  feeling_tags?: string[]
}): Promise<RemoteJournalEntry> {
  const user = await requireUser()

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: user.id,
      type: params.type,
      content: params.content,
      metadata: params.metadata ?? null,
      mood: params.mood ?? null,
      feeling_tags: params.feeling_tags ?? [],
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as RemoteJournalEntry
}

export async function updateJournalEntry(
  entryId: string,
  updates: {
    content?: string
    metadata?: Record<string, any> | null
    mood?: string | null
    feeling_tags?: string[]
    linked_moments?: string[]
  }
): Promise<RemoteJournalEntry> {
  const user = await requireUser()

  const payload: Record<string, any> = {}
  if (updates.content !== undefined) payload.content = updates.content
  if (updates.metadata !== undefined) payload.metadata = updates.metadata
  if (updates.mood !== undefined) payload.mood = updates.mood
  if (updates.feeling_tags !== undefined) payload.feeling_tags = updates.feeling_tags
  if (updates.linked_moments !== undefined) payload.linked_moments = updates.linked_moments

  const { data, error } = await supabase
    .from('entries')
    .update(payload)
    .eq('id', entryId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as RemoteJournalEntry
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const user = await requireUser()

  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw error
  }
}

export async function deleteAllJournalEntries(): Promise<void> {
  const user = await requireUser()

  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    throw error
  }
}

export async function deleteAllEntriesByType(type: EntryType): Promise<void> {
  const user = await requireUser()

  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('user_id', user.id)
    .eq('type', type)

  if (error) {
    throw error
  }
}

export async function logIntentAudit(params: {
  entryId: string
  prompt: string
  predictedIntent: string
  correctIntent: string
}): Promise<void> {
  const user = await requireUser()

  const { error } = await supabase.from('intent_audits').insert({
    user_id: user.id,
    entry_id: params.entryId,
    prompt: params.prompt,
    predicted_intent: params.predictedIntent,
    correct_intent: params.correctIntent,
  })

  if (error) {
    throw error
  }
}

export async function getJournalEntryById(
  id: string
): Promise<RemoteJournalEntry | null> {
  const user = await requireUser()

  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as RemoteJournalEntry | null) ?? null
}

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error('User is not authenticated')
  }

  return user
}
