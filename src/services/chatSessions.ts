import { supabase } from '../lib/supabase'

export interface ChatSessionInsert {
  id?: string
  sessionDate: string
  startedAt: string
  title?: string | null
  summary?: string | null
  messageCount?: number
  aiTitleConfidence?: number | null
}

export interface ChatSessionUpdate {
  endedAt?: string | null
  title?: string | null
  summary?: string | null
  messageCount?: number
  aiTitleConfidence?: number | null
}

export interface ChatSessionRecord {
  id: string
  user_id: string
  session_date: string
  started_at: string
  ended_at: string | null
  title: string | null
  summary: string | null
  message_count: number
  ai_title_confidence: number | null
  created_at: string
  updated_at: string
}

async function requireUserId(): Promise<string> {
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

  return user.id
}

export async function createChatSession(payload: ChatSessionInsert): Promise<ChatSessionRecord> {
  const userId = await requireUserId()

  const insertPayload: Record<string, any> = {
    user_id: userId,
    session_date: payload.sessionDate,
    started_at: payload.startedAt,
    message_count: payload.messageCount ?? 0,
  }

  if (payload.id) {
    insertPayload.id = payload.id
  }

  if (payload.title !== undefined) {
    insertPayload.title = payload.title
  }

  if (payload.summary !== undefined) {
    insertPayload.summary = payload.summary
  }

  if (payload.aiTitleConfidence !== undefined) {
    insertPayload.ai_title_confidence = payload.aiTitleConfidence
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ChatSessionRecord
}

export async function updateChatSession(
  id: string,
  updates: ChatSessionUpdate
): Promise<ChatSessionRecord> {
  await requireUserId()

  const payload: Record<string, any> = {}

  if (updates.endedAt !== undefined) {
    payload.ended_at = updates.endedAt
  }

  if (updates.title !== undefined) {
    payload.title = updates.title
  }

  if (updates.summary !== undefined) {
    payload.summary = updates.summary
  }

  if (updates.messageCount !== undefined) {
    payload.message_count = updates.messageCount
  }

  if (updates.aiTitleConfidence !== undefined) {
    payload.ai_title_confidence = updates.aiTitleConfidence
  }

  if (Object.keys(payload).length === 0) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select()
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      throw new Error('Chat session not found')
    }

    return data as ChatSessionRecord
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ChatSessionRecord
}

export async function listChatSessions(limit = 20): Promise<ChatSessionRecord[]> {
  const userId = await requireUserId()

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('session_date', { ascending: false })
    .limit(limit)

  if (error) {
    throw error
  }

  return (data ?? []) as ChatSessionRecord[]
}
