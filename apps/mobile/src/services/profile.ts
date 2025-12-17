import { supabase } from '../lib/supabase'

export interface ProfileStatsUpdate {
  missed_day_count?: number
  current_streak?: number
  last_message_at?: string | null
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
    throw new Error('User not authenticated')
  }

  return user.id
}

export async function updateProfileStats(
  updates: ProfileStatsUpdate
): Promise<ProfileStatsUpdate & { id: string }> {
  const userId = await requireUserId()

  if (Object.keys(updates).length === 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, missed_day_count, current_streak, last_message_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      throw new Error('Profile not found for user')
    }

    return {
      id: data.id as string,
      missed_day_count: data.missed_day_count ?? 0,
      current_streak: data.current_streak ?? 0,
      last_message_at: (data.last_message_at as string | null) ?? null,
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, missed_day_count, current_streak, last_message_at')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('Profile not found for user')
  }

  return {
    id: data.id as string,
    missed_day_count: data.missed_day_count ?? 0,
    current_streak: data.current_streak ?? 0,
    last_message_at: (data.last_message_at as string | null) ?? null,
  }
}

export async function fetchProfileStats(): Promise<ProfileStatsUpdate & { missed_day_count: number; current_streak: number }> {
  const userId = await requireUserId()

  const { data, error } = await supabase
    .from('profiles')
    .select('missed_day_count, current_streak, last_message_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return {
    missed_day_count: Number(data?.missed_day_count ?? 0),
    current_streak: Number(data?.current_streak ?? 0),
    last_message_at: (data?.last_message_at as string | null) ?? null,
  }
}
