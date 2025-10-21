// MVP Enhancement Types: Summaries, Embeddings, Memory, Goals, Check-ins

import type {
  CreateGoalInput,
  Goal,
  GoalStatus,
  MicroStep,
  UpdateGoalInput,
} from './goal'

type Nullable<T> = T | null

// Entry Summary Types
export interface EntrySummary {
  id: string
  entry_id: string
  user_id: string
  summary: string
  emotion: Nullable<string>
  topics: string[]
  people: string[]
  urgency_level: Nullable<number>
  suggested_action: Nullable<string>
  blockers: Nullable<string>
  dates_mentioned: Nullable<string[]>
  created_at: string
  updated_at: string
}

export interface CreateEntrySummaryParams {
  entry_id: string
  summary: string
  emotion?: string
  topics?: string[]
  people?: string[]
  urgency_level?: number
  suggested_action?: string
  blockers?: string
  dates_mentioned?: string[]
}

// Entry Embedding Types
export interface EntryEmbedding {
  id: string
  entry_id: string
  user_id: string
  embedding: number[]
  model: string
  created_at: string
}

export interface CreateEntryEmbeddingParams {
  entry_id: string
  embedding: number[]
  model?: string
}

export interface SimilarEntry {
  entry_id: string
  similarity: number
  entry?: any // Will be joined with entries table
}

// User Facts Types
export interface UserFact {
  id: string
  user_id: string
  fact: string
  category: Nullable<string>
  confidence: number
  source_entry_ids: string[]
  last_confirmed_at: Nullable<string>
  created_at: string
  updated_at: string
}

export interface CreateUserFactParams {
  fact: string
  category?: string
  confidence?: number
  source_entry_ids?: string[]
}

// Goals Types (re-exported for backwards compatibility)
export type { GoalStatus, MicroStep, Goal }
export type CreateGoalParams = CreateGoalInput
export type UpdateGoalParams = UpdateGoalInput

// Check-ins Types
export type CheckInType = 'daily_morning' | 'daily_evening' | 'weekly'

export interface CheckIn {
  id: string
  user_id: string
  type: CheckInType
  prompt: string
  response: Nullable<string>
  response_entry_id: Nullable<string>
  scheduled_for: string
  completed_at: Nullable<string>
  created_at: string
}

export interface CreateCheckInParams {
  type: CheckInType
  prompt: string
  scheduled_for: string
}

export interface CompleteCheckInParams {
  response: string
  response_entry_id?: string
}

// AI Processing Types
export interface SummarizeEntryResult {
  summary: string
  emotion?: string
  topics?: string[]
  people?: string[]
  urgency_level?: number
  suggested_action?: string
  blockers?: string
  dates_mentioned?: string[]
  reflection: string // The AI's immediate response to user
}

export interface AnalystQueryResult {
  answer: string
  citations: Array<{
    entry_id: string
    date: string
    snippet: string
  }>
  relevant_facts?: string[]
}

export interface GoalDetectionResult {
  goal_detected: boolean
  suggested_title?: string
  suggested_description?: string
  suggested_category?: string
  suggested_micro_steps?: string[]
}

// Weekly Review Types
export interface WeeklyReviewData {
  themes: string[]
  top_blockers: string[]
  progress_on_goals: Array<{
    goal_id: string
    title: string
    progress_summary: string
  }>
  focus_note: string
}
