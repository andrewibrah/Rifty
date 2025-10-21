import { supabase } from '../lib/supabase'
import { generateEmbedding } from './embeddings'
import {
  CreateGoalInputSchema,
  GoalSchema,
  GoalStatus,
  MicroStep,
  UpdateGoalInputSchema,
  type CreateGoalInput,
  type Goal,
  type UpdateGoalInput,
} from '../types/goal'
import { generateUUID } from '../utils/id'
import { getDedupeThreshold } from '../utils/flags'

const MAX_ACTIVE_GOALS = 3
const DEFAULT_DEDUPE_THRESHOLD = 0.9

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error('User not authenticated')
  }
  return user.id
}

function toISODate(value?: string): string | null {
  if (!value) return null
  return value
}

type MicroStepLike = Partial<MicroStep> & { description: string }

function sanitizeMicroSteps(
  steps: MicroStepLike[] | undefined | null
): MicroStep[] {
  if (!Array.isArray(steps)) {
    return []
  }

  return steps.map((step) => ({
    id: step.id || generateUUID(),
    description: step.description.trim(),
    completed: Boolean(step.completed),
    completed_at: step.completed
      ? step.completed_at ?? new Date().toISOString()
      : null,
  }))
}

function computeProgress(steps: MicroStep[]): { completed: number; total: number; ratio: number } {
  const total = steps.length
  if (total === 0) {
    return { completed: 0, total: 0, ratio: 0 }
  }
  const completed = steps.filter((step) => step.completed).length
  return { completed, total, ratio: completed / total }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0
  const length = Math.min(a.length, b.length)
  if (length === 0) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let index = 0; index < length; index += 1) {
    const x = a[index] ?? 0
    const y = b[index] ?? 0
    dot += x * y
    magA += x * x
    magB += y * y
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function asVector(value: unknown): number[] | null {
  if (!value) return null
  if (Array.isArray(value)) {
    return value.filter((component) => typeof component === 'number') as number[]
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? (parsed.filter((component) => typeof component === 'number') as number[])
        : null
    } catch (_error) {
      return null
    }
  }
  return null
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

async function fetchExistingGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
  if (error) {
    console.error('[goals.unified] fetchExistingGoals error', error)
    throw error
  }
  return GoalSchema.array().parse(data ?? [])
}

async function upsertProgressCache(goal: Goal): Promise<void> {
  const steps = sanitizeMicroSteps(goal.micro_steps)
  const { ratio } = computeProgress(steps)
  const ghiState: string =
    goal.status === 'completed' || ratio >= 0.9999 ? 'complete' : 'unknown'

  const { error } = await supabase
    .from('goal_progress_cache')
    .upsert(
      {
        goal_id: goal.id,
        progress_pct: ratio,
        coherence_score: 0,
        ghi_state: ghiState,
        last_computed_at: new Date().toISOString(),
      },
      { onConflict: 'goal_id' }
    )

  if (error) {
    console.error('[goals.unified] upsertProgressCache error', error)
  }
}

function mergeMetadata(existing: Record<string, any>, incoming?: Record<string, any>) {
  if (!incoming) return existing
  return {
    ...existing,
    ...incoming,
  }
}

function mergeMicroSteps(existing: MicroStep[], incoming: MicroStep[]): MicroStep[] {
  const byId = new Map<string, MicroStep>()
  existing.forEach((step) => {
    byId.set(step.id, step)
  })

  incoming.forEach((step) => {
    const normalized: MicroStep = {
      id: step.id || generateUUID(),
      description: step.description.trim(),
      completed: Boolean(step.completed),
      completed_at: step.completed
        ? step.completed_at ?? new Date().toISOString()
        : null,
    }
    if (!byId.has(normalized.id)) {
      byId.set(normalized.id, normalized)
      return
    }
    const prev = byId.get(normalized.id) as MicroStep
    byId.set(normalized.id, {
      ...prev,
      ...normalized,
      description: normalized.description || prev.description,
      completed:
        prev.completed || normalized.completed,
      completed_at:
        normalized.completed
          ? normalized.completed_at ?? prev.completed_at ?? new Date().toISOString()
          : prev.completed_at,
    })
  })

  return Array.from(byId.values())
}

function nextCurrentStep(steps: MicroStep[]): string | null {
  const pending = steps.find((step) => !step.completed)
  return pending ? pending.description : null
}

async function applyDedupe(
  userId: string,
  candidateEmbedding: number[],
  payload: ReturnType<typeof CreateGoalInputSchema.parse>
): Promise<Goal | null> {
  const dedupeThreshold = getDedupeThreshold() || DEFAULT_DEDUPE_THRESHOLD
  const existingGoals = await fetchExistingGoals(userId)
  const normalizedTitle = normalizeTitle(payload.title)

  for (const goal of existingGoals) {
    const existingEmbedding = asVector((goal as any).embedding)
    if (!existingEmbedding) continue

    const similarity = cosineSimilarity(candidateEmbedding, existingEmbedding)
    if (similarity < dedupeThreshold) continue

    const sameCategory =
      (goal.category ?? '').toLowerCase() === (payload.category ?? '').toLowerCase()
    const titleMatch = normalizeTitle(goal.title) === normalizedTitle

    if (!sameCategory && !titleMatch) continue

    const mergedSteps = mergeMicroSteps(
      sanitizeMicroSteps(goal.micro_steps),
      sanitizeMicroSteps(payload.micro_steps as any)
    )

    const updates: UpdateGoalInput = {
      description: payload.description ?? goal.description ?? undefined,
      category: payload.category ?? goal.category ?? undefined,
      target_date: payload.target_date ?? undefined,
      current_step: payload.current_step ?? nextCurrentStep(mergedSteps) ?? undefined,
      micro_steps: mergedSteps,
      metadata: mergeMetadata(goal.metadata ?? {}, payload.metadata),
    }

    const updated = await persistGoalUpdate({
      goalId: goal.id,
      updates,
      newEmbedding: candidateEmbedding,
    })

    return updated
  }

  return null
}

async function persistGoalUpdate({
  goalId,
  updates,
  newEmbedding,
}: {
  goalId: string
  updates: UpdateGoalInput
  newEmbedding?: number[]
}): Promise<Goal> {
  const sanitized = UpdateGoalInputSchema.parse(updates)

  const microSteps = sanitized.micro_steps
    ? sanitizeMicroSteps(sanitized.micro_steps as unknown as MicroStep[])
    : undefined

  const payload: Record<string, any> = {
    ...sanitized,
  }

  if (microSteps) {
    payload.micro_steps = microSteps
    payload.current_step = sanitized.current_step ?? nextCurrentStep(microSteps)
    const { ratio } = computeProgress(microSteps)
    if (ratio >= 0.9999) {
      payload.status = sanitized.status ?? 'completed'
    }
  }

  if (sanitized.target_date === '') {
    payload.target_date = null
  }

  if (newEmbedding) {
    payload.embedding = newEmbedding
  }

  const { data, error } = await supabase
    .from('goals')
    .update(payload)
    .eq('id', goalId)
    .select('*')
    .single()

  if (error) {
    console.error('[goals.unified] persistGoalUpdate error', error)
    throw error
  }

  const parsed = GoalSchema.parse(data)
  await upsertProgressCache(parsed)
  return parsed
}

export async function createGoal(
  input: CreateGoalInput
): Promise<Goal> {
  const userId = await requireUserId()
  const parsed = CreateGoalInputSchema.parse(input)

  const activeCountQuery = await supabase
    .from('goals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active')

  const activeCount = activeCountQuery.count ?? 0
  if (activeCount >= MAX_ACTIVE_GOALS) {
    throw new Error('MAX_ACTIVE_GOALS_REACHED')
  }

  const textForEmbedding = [
    parsed.title,
    parsed.description ?? '',
    parsed.category ?? '',
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join('\n')

  const embedding = await generateEmbedding(textForEmbedding || parsed.title)

  const deduped = await applyDedupe(userId, embedding, parsed)
  if (deduped) {
    return deduped
  }

  const steps = sanitizeMicroSteps(
    (parsed.micro_steps as unknown as MicroStep[]) ?? []
  )

  const insertPayload: Record<string, any> = {
    user_id: userId,
    title: parsed.title,
    description: parsed.description ?? null,
    category: parsed.category ?? null,
    target_date: parsed.target_date ? toISODate(parsed.target_date) : null,
    current_step: parsed.current_step ?? nextCurrentStep(steps),
    micro_steps: steps,
    source_entry_id: parsed.source_entry_id ?? null,
    metadata: mergeMetadata({}, parsed.metadata),
    status: 'active' as GoalStatus,
    embedding,
  }

  const { data, error } = await supabase
    .from('goals')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    console.error('[goals.unified] createGoal error', error)
    throw error
  }

  const parsedGoal = GoalSchema.parse(data)
  await upsertProgressCache(parsedGoal)
  return parsedGoal
}

export async function updateGoalById(
  goalId: string,
  updates: UpdateGoalInput
): Promise<Goal> {
  const userId = await requireUserId()
  if (!goalId) {
    throw new Error('Goal id required')
  }

  const { data: existing, error: existingError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single()

  if (existingError) {
    console.error('[goals.unified] updateGoalById fetch error', existingError)
    throw existingError
  }

  const parsedExisting = GoalSchema.parse(existing)

  const requiresEmbeddingRefresh = Boolean(
    updates.title || updates.description || updates.category
  )

  const newEmbedding = requiresEmbeddingRefresh
    ? await generateEmbedding(
        [
          updates.title ?? parsedExisting.title,
          updates.description ?? parsedExisting.description ?? '',
          updates.category ?? parsedExisting.category ?? '',
        ]
          .map((value) => value?.trim())
          .filter(Boolean)
          .join('\n')
      )
    : undefined

  const mergedSteps = updates.micro_steps
    ? sanitizeMicroSteps(updates.micro_steps as unknown as MicroStep[])
    : sanitizeMicroSteps(parsedExisting.micro_steps)

  const finalUpdates: UpdateGoalInput = {
    ...updates,
    micro_steps: mergedSteps,
  }

  if (!updates.current_step) {
    finalUpdates.current_step = nextCurrentStep(mergedSteps) ?? undefined
  }

  const progress = computeProgress(mergedSteps)
  if (progress.ratio >= 0.9999) {
    finalUpdates.status = updates.status ?? 'completed'
  }

  const persistPayload: {
    goalId: string
    updates: UpdateGoalInput
    newEmbedding?: number[]
  } = {
    goalId,
    updates: finalUpdates,
  }

  if (newEmbedding) {
    persistPayload.newEmbedding = newEmbedding
  }

  const updated = await persistGoalUpdate(persistPayload)

  return updated
}

export async function getGoalById(goalId: string): Promise<Goal | null> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[goals.unified] getGoalById error', error)
    throw error
  }

  return data ? GoalSchema.parse(data) : null
}

export async function listGoals(options: {
  status?: GoalStatus
  limit?: number
} = {}): Promise<Goal[]> {
  const userId = await requireUserId()
  const limit = options.limit ?? 50

  let query = supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[goals.unified] listGoals error', error)
    throw error
  }

  return GoalSchema.array().parse(data ?? [])
}

export async function deleteGoal(goalId: string): Promise<void> {
  const userId = await requireUserId()
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId)

  if (error) {
    console.error('[goals.unified] deleteGoal error', error)
    throw error
  }
}

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
      ? {
          ...step,
          completed: true,
          completed_at: step.completed_at ?? new Date().toISOString(),
        }
      : step
  )

  return updateGoalById(goalId, { micro_steps: updatedSteps })
}

export async function addMicroStep(
  goalId: string,
  description: string
): Promise<Goal> {
  const goal = await getGoalById(goalId)
  if (!goal) {
    throw new Error('Goal not found')
  }

  const newStep: MicroStep = {
    id: generateUUID(),
    description: description.trim(),
    completed: false,
    completed_at: null,
  }

  return updateGoalById(goalId, {
    micro_steps: [...goal.micro_steps, newStep],
  })
}
