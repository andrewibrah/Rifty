import { supabase } from '../lib/supabase'
import type {
  Goal,
  CreateGoalParams,
  UpdateGoalParams,
  GoalStatus,
  MicroStep,
} from '../types/mvp'

/**
 * Create a new goal
 */
export async function createGoal(params: CreateGoalParams): Promise<Goal> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      title: params.title,
      description: params.description ?? null,
      category: params.category ?? null,
      target_date: params.target_date ?? null,
      current_step: params.current_step ?? null,
      micro_steps: params.micro_steps ?? [],
      source_entry_id: params.source_entry_id ?? null,
      metadata: params.metadata ?? {},
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    console.error('[createGoal] Error:', error)
    throw error
  }

  return data as Goal
}

/**
 * Get goal by ID
 */
export async function getGoalById(goalId: string): Promise<Goal | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[getGoalById] Error:', error)
    throw error
  }

  return data as Goal | null
}

/**
 * List goals
 */
export async function listGoals(options: {
  status?: GoalStatus
  limit?: number
} = {}): Promise<Goal[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const limit = options.limit ?? 50

  let query = supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[listGoals] Error:', error)
    throw error
  }

  return (data ?? []) as Goal[]
}

/**
 * Update a goal
 */
export async function updateGoal(
  goalId: string,
  updates: UpdateGoalParams
): Promise<Goal> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', goalId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('[updateGoal] Error:', error)
    throw error
  }

  return data as Goal
}

/**
 * Complete a micro-step
 */
export async function completeMicroStep(
  goalId: string,
  stepId: string
): Promise<Goal> {
  const goal = await getGoalById(goalId)
  if (!goal) {
    throw new Error('Goal not found')
  }

  const updatedSteps = goal.micro_steps.map((step) =>
    step.id === stepId
      ? { ...step, completed: true, completed_at: new Date().toISOString() }
      : step
  )

  return updateGoal(goalId, { micro_steps: updatedSteps })
}

/**
 * Add a micro-step to a goal
 */
export async function addMicroStep(
  goalId: string,
  description: string
): Promise<Goal> {
  const goal = await getGoalById(goalId)
  if (!goal) {
    throw new Error('Goal not found')
  }

  const newStep: MicroStep = {
    id: Date.now().toString(),
    description,
    completed: false,
  }

  const updatedSteps = [...goal.micro_steps, newStep]
  return updateGoal(goalId, { micro_steps: updatedSteps })
}

/**
 * Delete a goal
 */
export async function deleteGoal(goalId: string): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[deleteGoal] Error:', error)
    throw error
  }
}

/**
 * Get active goals (for display in UI)
 */
export async function getActiveGoals(): Promise<Goal[]> {
  return listGoals({ status: 'active', limit: 20 })
}
