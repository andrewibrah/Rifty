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
}): Promise<RemoteJournalEntry> {
  const user = await requireUser()

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: user.id,
      type: params.type,
      content: params.content,
      metadata: params.metadata ?? null,
    })
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
