import { Memory } from '@/agent/memory';
import type { PlannerResponse } from '@/agent/types';

export interface ToolExecutionContext {
  originalText: string;
}

export interface ToolExecutionResult {
  action: string;
  payload: Record<string, unknown>;
}

export function handleToolCall(
  plan: PlannerResponse | null,
  _context: ToolExecutionContext
): ToolExecutionResult | null {
  if (!plan) return null;

  switch (plan.action) {
    case 'journal.create':
    case 'goal.create':
    case 'schedule.create':
    case 'settings.update':
    case 'reflect':
    case 'noop':
      return {
        action: plan.action,
        payload: plan.payload ?? {},
      };
    default:
      return null;
  }
}
