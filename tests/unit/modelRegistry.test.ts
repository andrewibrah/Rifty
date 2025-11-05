import { describe, it, expect, vi, beforeEach } from 'vitest';

const singleMock = vi.fn().mockResolvedValue({
  data: {
    id: 'model-1',
    model_name: 'demo',
    version: '1.0.0',
    description: null,
    artifact_path: null,
    metadata: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  error: null,
});

const selectMock = vi.fn().mockReturnValue({ single: singleMock });

const insertMock = vi.fn().mockReturnValue({ select: selectMock });

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({ insert: insertMock }),
  },
}));

import { registerModelVersion } from '@/services/modelRegistry';
import { supabase } from '@/lib/supabase';

describe('modelRegistry service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults metadata to null when not provided', async () => {
    const record = await registerModelVersion({ modelName: 'demo', version: '1.0.0' });

    expect(supabase.from).toHaveBeenCalledWith('model_registry');
    expect(insertMock).toHaveBeenCalledWith({
      model_name: 'demo',
      version: '1.0.0',
      description: null,
      artifact_path: null,
      metadata: null,
    });
    expect(record.metadata).toBeNull();
  });
});
