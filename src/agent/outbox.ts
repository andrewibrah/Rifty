import AsyncStorage from '@react-native-async-storage/async-storage';
import { nanoid } from '@/agent/utils/nanoid';

const STORAGE_KEY = 'riflett_outbox_v1';

export type OutboxJobKind = 'polish';

export interface OutboxJob {
  id: string;
  kind: OutboxJobKind;
  payload: Record<string, unknown>;
  createdAt: number;
}

const loadJobs = async (): Promise<OutboxJob[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveJobs = (jobs: OutboxJob[]): Promise<void> =>
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));

export const Outbox = {
  async queue(job: Omit<OutboxJob, 'id' | 'createdAt'> & { id?: string }): Promise<OutboxJob> {
    const current = await loadJobs();
    const payload: OutboxJob = {
      id: job.id ?? nanoid(),
      kind: job.kind,
      payload: job.payload,
      createdAt: Date.now(),
    };
    current.push(payload);
    await saveJobs(current);
    return payload;
  },

  async list(): Promise<OutboxJob[]> {
    return loadJobs();
  },

  async clear(jobId: string): Promise<void> {
    const jobs = await loadJobs();
    const filtered = jobs.filter((job) => job.id !== jobId);
    await saveJobs(filtered);
  },
};
