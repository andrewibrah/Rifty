import { Memory } from '@/agent/memory';
import type { PlannerResponse } from '@/agent/types';
import { persistScheduleBlock } from '@/services/schedules';

export interface ToolExecutionContext {
  originalText: string;
}

export interface ToolExecutionResult {
  action: string;
  payload: Record<string, unknown>;
}

export async function handleToolCall(
  plan: PlannerResponse | null,
  _context: ToolExecutionContext
): Promise<ToolExecutionResult | null> {
  if (!plan) return null;

  if (plan.action === 'schedule.create') {
    const payload = plan.payload ?? {};
    const startRaw =
      typeof payload.start === 'string'
        ? payload.start
        : typeof (payload as Record<string, unknown>).start_at === 'string'
        ? (payload as Record<string, string>).start_at
        : null;
    const endRaw =
      typeof payload.end === 'string'
        ? payload.end
        : typeof (payload as Record<string, unknown>).end_at === 'string'
        ? (payload as Record<string, string>).end_at
        : null;
    if (!startRaw || !endRaw) {
      throw new Error('Planner schedule payload missing start/end');
    }

    const start = startRaw;
    const end = endRaw;

    const receipts: Record<string, unknown> =
      payload.receipts && typeof payload.receipts === 'object'
        ? (payload.receipts as Record<string, unknown>)
        : {};
    const metadata: Record<string, unknown> =
      payload.metadata && typeof payload.metadata === 'object'
        ? (payload.metadata as Record<string, unknown>)
        : {};

    const blockInput = {
      start,
      end,
      intent: typeof payload.intent === 'string' && payload.intent.trim().length > 0
        ? payload.intent
        : 'focus.block',
      goal_id: typeof payload.goal_id === 'string' ? payload.goal_id : null,
      summary: typeof payload.summary === 'string' ? payload.summary : null,
      location: typeof payload.location === 'string' ? payload.location : null,
      attendees: Array.isArray(payload.attendees)
        ? payload.attendees.filter((attendee: unknown): attendee is string => typeof attendee === 'string')
        : [],
      receipts,
      metadata,
    };

    const persisted = await persistScheduleBlock(null, blockInput);

    return {
      action: plan.action,
      payload: {
        ...payload,
        schedule: persisted,
      },
    };
  }

  switch (plan.action) {
    case 'journal.create':
    case 'goal.create':
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
