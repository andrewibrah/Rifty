import type { PlannerResponse } from '@/agent/types';
import { persistScheduleBlock } from '@/services/schedules';

export interface ToolExecutionContext {
  originalText: string;
}

export interface ToolExecutionResult {
  action: string;
  payload: Record<string, unknown>;
}

const getStartTime = (payload: Record<string, unknown>): string | null => {
  if (typeof payload.start === 'string') return payload.start;
  if (typeof payload.start_at === 'string') return payload.start_at;
  return null;
};

const getEndTime = (payload: Record<string, unknown>): string | null => {
  if (typeof payload.end === 'string') return payload.end;
  if (typeof payload.end_at === 'string') return payload.end_at;
  return null;
};

export async function handleToolCall(
  plan: PlannerResponse | null,
  _context: ToolExecutionContext
): Promise<ToolExecutionResult | null> {
  if (!plan) return null;

  if (plan.action === 'schedule.create') {
    const payload = (plan.payload ?? {}) as Record<string, unknown>;
    const startRaw = getStartTime(payload);
    const endRaw = getEndTime(payload);

    if (!startRaw || !endRaw) {
      throw new Error('Planner schedule payload missing start/end');
    }

    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error('Invalid date format for start or end time');
    }

    if (startDate.getTime() >= endDate.getTime()) {
      throw new Error('Schedule start time must be before end time');
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
