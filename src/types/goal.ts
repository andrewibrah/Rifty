import { z } from 'zod'

export type Nullable<T> = T | null

export const GoalStatusSchema = z.enum([
  'active',
  'completed',
  'archived',
  'paused',
])

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

export const MicroStepSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  completed: z.boolean(),
  completed_at: z.string().datetime({ offset: true }).nullable().optional(),
})

export const GoalMetadataSchema = z.record(z.any())

export const GoalSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().nullable(),
  target_date: z.string().regex(isoDateRegex).nullable().optional(),
  status: GoalStatusSchema,
  current_step: z.string().nullable(),
  micro_steps: z.array(MicroStepSchema),
  source_entry_id: z.string().uuid().nullable(),
  metadata: GoalMetadataSchema,
  embedding: z.array(z.number()).length(1536).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const CreateMicroStepInputSchema = MicroStepSchema.pick({
  description: true,
}).extend({
  id: z.string().optional(),
  completed: z.boolean().optional(),
  completed_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
})

export const CreateGoalInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  target_date: z.string().regex(isoDateRegex, 'target_date must be YYYY-MM-DD').optional(),
  current_step: z.string().optional(),
  micro_steps: z.array(CreateMicroStepInputSchema).optional(),
  source_entry_id: z.string().uuid().optional(),
  metadata: GoalMetadataSchema.optional(),
})

export const UpdateGoalInputSchema = CreateGoalInputSchema.partial().extend({
  status: GoalStatusSchema.optional(),
  micro_steps: z
    .array(
      MicroStepSchema.extend({
        id: z.string(),
      })
    )
    .optional(),
})

export const GoalReflectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  goal_id: z.string().uuid(),
  entry_id: z.string().uuid(),
  alignment_score: z.number().min(0).max(1),
  emotion: z.record(z.any()),
  note: z.string().nullable(),
  created_at: z.string(),
})

export const GoalProgressCacheSchema = z.object({
  goal_id: z.string().uuid(),
  progress_pct: z.number().min(0),
  coherence_score: z.number().min(0).max(1),
  ghi_state: z.enum(['alive', 'dormant', 'misaligned', 'complete', 'unknown']),
  last_computed_at: z.string(),
})

export const AIGoalSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  goal_id: z.string().uuid().nullable(),
  utterance: z.string().min(1),
  response_summary: z.string().nullable(),
  created_at: z.string(),
})

export const GoalAnchorSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  goal_id: z.string().uuid(),
  anchor_type: z.enum(['check_in', 'milestone']),
  scheduled_for: z.string(),
  completed_at: z.string().nullable(),
  metadata: GoalMetadataSchema,
  created_at: z.string(),
})

export type GoalStatus = z.infer<typeof GoalStatusSchema>
export type MicroStep = z.infer<typeof MicroStepSchema>
export type Goal = z.infer<typeof GoalSchema>
export type CreateGoalInput = z.infer<typeof CreateGoalInputSchema>
export type UpdateGoalInput = z.infer<typeof UpdateGoalInputSchema>
export type GoalReflection = z.infer<typeof GoalReflectionSchema>
export type GoalProgressCache = z.infer<typeof GoalProgressCacheSchema>
export type AIGoalSession = z.infer<typeof AIGoalSessionSchema>
export type GoalAnchor = z.infer<typeof GoalAnchorSchema>

export type GoalMetadata = Record<string, any>

export interface GoalContextLinkedEntry {
  id: string
  created_at: string
  snippet: string
}

export interface GoalContextItem {
  id: string
  title: string
  status: GoalStatus
  priority_score: number
  target_date: string | null
  current_step: string | null
  micro_steps: MicroStep[]
  progress: { completed: number; total: number; ratio: number }
  description: string | null
  updated_at: string | null
  metadata: GoalMetadata
  source_entry_id: string | null
  conflicts: string[]
  linked_entries: GoalContextLinkedEntry[]
}

export function normalizeMicroSteps(
  steps: Nullable<MicroStep[]>
): MicroStep[] {
  if (!Array.isArray(steps)) {
    return []
  }

  return steps.map((step) => ({
    ...step,
    completed: Boolean(step.completed),
    completed_at: step.completed_at ?? null,
  }))
}
