import { supabase } from '../lib/supabase'
import type {
  CheckIn,
  CheckInType,
  CreateCheckInParams,
  CompleteCheckInParams,
} from '../types/mvp'

const MORNING_PROMPTS = [
  'One priority, one constraint?',
  'What matters most today?',
  'What would make today meaningful?',
  'Where will you focus today?',
]

const EVENING_PROMPTS = [
  'One win, one lesson?',
  'What went well today?',
  'What did you learn today?',
  'What are you grateful for?',
]

const WEEKLY_PROMPT = `Weekly reflection:
- What themes emerged?
- Top blockers?
- Progress on goals?
- Focus for next week?`

/**
 * Get a random prompt for a check-in type
 */
function getPromptForType(type: CheckInType): string {
  switch (type) {
    case 'daily_morning':
      return MORNING_PROMPTS[Math.floor(Math.random() * MORNING_PROMPTS.length)]
    case 'daily_evening':
      return EVENING_PROMPTS[Math.floor(Math.random() * EVENING_PROMPTS.length)]
    case 'weekly':
      return WEEKLY_PROMPT
  }
}

/**
 * Create a check-in
 */
export async function createCheckIn(
  params: CreateCheckInParams
): Promise<CheckIn> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('check_ins')
    .insert({
      user_id: user.id,
      type: params.type,
      prompt: params.prompt,
      scheduled_for: params.scheduled_for,
    })
    .select()
    .single()

  if (error) {
    console.error('[createCheckIn] Error:', error)
    throw error
  }

  return data as CheckIn
}

/**
 * Get pending check-in for today
 */
export async function getPendingCheckIn(
  type?: CheckInType
): Promise<CheckIn | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59
  )

  let query = supabase
    .from('check_ins')
    .select('*')
    .eq('user_id', user.id)
    .is('completed_at', null)
    .gte('scheduled_for', startOfDay.toISOString())
    .lte('scheduled_for', endOfDay.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(1)

  if (type) {
    query = query.eq('type', type)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error('[getPendingCheckIn] Error:', error)
    throw error
  }

  return data as CheckIn | null
}

/**
 * Complete a check-in
 */
export async function completeCheckIn(
  checkInId: string,
  params: CompleteCheckInParams
): Promise<CheckIn> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('check_ins')
    .update({
      response: params.response,
      response_entry_id: params.response_entry_id ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', checkInId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('[completeCheckIn] Error:', error)
    throw error
  }

  return data as CheckIn
}

/**
 * Schedule daily check-ins for a user
 */
export async function scheduleDailyCheckIns(timezone: string = 'UTC'): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Morning check-in at 8 AM
  const morningTime = new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
    8,
    0,
    0
  )

  // Evening check-in at 8 PM
  const eveningTime = new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
    20,
    0,
    0
  )

  await Promise.all([
    createCheckIn({
      type: 'daily_morning',
      prompt: getPromptForType('daily_morning'),
      scheduled_for: morningTime.toISOString(),
    }),
    createCheckIn({
      type: 'daily_evening',
      prompt: getPromptForType('daily_evening'),
      scheduled_for: eveningTime.toISOString(),
    }),
  ])
}

/**
 * Schedule weekly check-in
 */
export async function scheduleWeeklyCheckIn(timezone: string = 'UTC'): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const now = new Date()
  const daysUntilSunday = (7 - now.getDay()) % 7
  const nextSunday = new Date(
    now.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000
  )

  // Sunday at 6 PM
  const weeklyTime = new Date(
    nextSunday.getFullYear(),
    nextSunday.getMonth(),
    nextSunday.getDate(),
    18,
    0,
    0
  )

  await createCheckIn({
    type: 'weekly',
    prompt: getPromptForType('weekly'),
    scheduled_for: weeklyTime.toISOString(),
  })
}

/**
 * List all check-ins
 */
export async function listCheckIns(options: {
  completed?: boolean
  limit?: number
} = {}): Promise<CheckIn[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const limit = options.limit ?? 50

  let query = supabase
    .from('check_ins')
    .select('*')
    .eq('user_id', user.id)
    .order('scheduled_for', { ascending: false })
    .limit(limit)

  if (options.completed !== undefined) {
    if (options.completed) {
      query = query.not('completed_at', 'is', null)
    } else {
      query = query.is('completed_at', null)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error('[listCheckIns] Error:', error)
    throw error
  }

  return (data ?? []) as CheckIn[]
}
