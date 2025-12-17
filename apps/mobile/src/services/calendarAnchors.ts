import { supabase } from '../lib/supabase'
import type { Goal, GoalAnchor } from '../types/goal'
import { GoalAnchorSchema } from '../types/goal'
import { isGoalsV2Enabled } from '../utils/flags'

const RHYTHM_RESET_OFFSETS = [1, 2, 3] // days offset from now

export async function planRhythmReset(goal: Goal): Promise<GoalAnchor[]> {
  if (!isGoalsV2Enabled()) {
    return []
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('User not authenticated')
  }

  const now = new Date()
  const anchorsPayload = RHYTHM_RESET_OFFSETS.map((offset, index) => {
    const scheduled = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
    scheduled.setHours(index === 1 ? 18 : 9, 0, 0, 0)

    const anchorType = index === 1 ? 'milestone' : 'check_in'

    return {
      user_id: user.id,
      goal_id: goal.id,
      anchor_type: anchorType,
      scheduled_for: scheduled.toISOString(),
      metadata: {
        plan: 'rhythm_reset',
        created_from: 'GoalsPanel',
      },
    }
  })

  const { data, error: upsertError } = await supabase
    .from('goal_anchors')
    .upsert(anchorsPayload, { onConflict: 'goal_id,anchor_type,scheduled_for' })
    .select('*')

  if (upsertError) {
    throw upsertError
  }

  return (data ?? []).map((row) => GoalAnchorSchema.parse(row))
}

export async function listAnchors(goalId: string): Promise<GoalAnchor[]> {
  if (!isGoalsV2Enabled()) {
    return []
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error: fetchError } = await supabase
    .from('goal_anchors')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', user.id)
    .order('scheduled_for', { ascending: true })

  if (fetchError) {
    throw fetchError
  }

  return (data ?? []).map((row) => GoalAnchorSchema.parse(row))
}

export async function completeAnchor(anchorId: string): Promise<void> {
  if (!isGoalsV2Enabled()) {
    return
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('User not authenticated')
  }

  const { error: updateError } = await supabase
    .from('goal_anchors')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', anchorId)
    .eq('user_id', user.id)

  if (updateError) {
    throw updateError
  }
}

export async function checkMissedAnchors(): Promise<GoalAnchor[]> {
  if (!isGoalsV2Enabled()) {
    return []
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error: fetchError } = await supabase
    .from('goal_anchors')
    .select('*')
    .eq('user_id', user.id)
    .is('completed_at', null)
    .lt('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(10)

  if (fetchError) {
    throw fetchError
  }

  return (data ?? []).map((row) => GoalAnchorSchema.parse(row))
}
