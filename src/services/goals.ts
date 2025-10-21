import type { GoalStatus } from '../types/goal'
import type { Goal } from '../types/goal'
import type { CreateGoalParams, UpdateGoalParams } from '../types/mvp'
import {
  addMicroStep as addMicroStepUnified,
  completeMicroStep as completeMicroStepUnified,
  createGoal as createGoalUnified,
  deleteGoal as deleteGoalUnified,
  getGoalById as getGoalByIdUnified,
  listGoals as listGoalsUnified,
  updateGoalById as updateGoalUnified,
} from './goals.unified'

export async function createGoal(params: CreateGoalParams): Promise<Goal> {
  return createGoalUnified(params)
}

export async function getGoalById(goalId: string): Promise<Goal | null> {
  return getGoalByIdUnified(goalId)
}

export async function listGoals(options: {
  status?: GoalStatus
  limit?: number
} = {}): Promise<Goal[]> {
  return listGoalsUnified(options)
}

export async function updateGoal(
  goalId: string,
  updates: UpdateGoalParams
): Promise<Goal> {
  return updateGoalUnified(goalId, updates)
}

export async function completeMicroStep(
  goalId: string,
  stepId: string
): Promise<Goal> {
  return completeMicroStepUnified(goalId, stepId)
}

export async function addMicroStep(
  goalId: string,
  description: string
): Promise<Goal> {
  return addMicroStepUnified(goalId, description)
}

export async function deleteGoal(goalId: string): Promise<void> {
  return deleteGoalUnified(goalId)
}

export async function getActiveGoals(): Promise<Goal[]> {
  return listGoalsUnified({ status: 'active', limit: 20 })
}
