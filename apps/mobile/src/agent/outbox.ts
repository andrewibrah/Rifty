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
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[Outbox] Failed to load jobs from ${STORAGE_KEY}:`, error.message, error.stack);
    return [];
  }
};

const saveJobs = (jobs: OutboxJob[]): Promise<void> =>
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));

let queueChain: Promise<void> = Promise.resolve();

const enqueueExclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
  const resultPromise = queueChain.then(operation);
  queueChain = resultPromise
    .then(() => undefined)
    .catch(() => undefined);
  return resultPromise;
};

export const Outbox = {
  async queue(job: Omit<OutboxJob, 'id' | 'createdAt'> & { id?: string }): Promise<OutboxJob> {
    return enqueueExclusive(async () => {
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
    });
  },

  async list(): Promise<OutboxJob[]> {
    return loadJobs();
  },

  async clear(jobId: string): Promise<void> {
    await enqueueExclusive(async () => {
      const jobs = await loadJobs();
      const filtered = jobs.filter((job) => job.id !== jobId);
      await saveJobs(filtered);
    });
  },
};
