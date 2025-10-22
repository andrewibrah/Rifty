// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { persistScheduleBlock } from '@/services/schedules';
import { supabase } from '@/lib/supabase';

const insertMock = vi.spyOn(supabase, 'from');

afterEach(() => {
  insertMock.mockReset();
});

describe('persistScheduleBlock', () => {
  it('validates timestamps and forwards to Supabase', async () => {
    insertMock.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: {
              id: 'sched-1',
              user_id: 'user-123',
              start_at: '2025-10-21T09:00:00.000Z',
              end_at: '2025-10-21T09:30:00.000Z',
              intent: 'focus.block',
              goal_id: null,
              summary: null,
              location: null,
              attendees: [],
              receipts: {},
              metadata: {},
              created_at: '2025-10-20T00:00:00.000Z',
              updated_at: '2025-10-20T00:00:00.000Z',
            },
            error: null,
          }),
        }),
      }),
    } as any);

    const block = await persistScheduleBlock('user-123', {
      start: '2025-10-21T09:00:00.000Z',
      end: '2025-10-21T09:30:00.000Z',
      intent: 'focus.block',
    });

    expect(block.id).toBe('sched-1');
  });

  it('throws when end precedes start', async () => {
    await expect(
      persistScheduleBlock('user-123', {
        start: '2025-10-21T10:00:00.000Z',
        end: '2025-10-21T09:30:00.000Z',
        intent: 'focus.block',
      })
    ).rejects.toThrow('Schedule block end must be after start');
  });
});
