import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  FailureTrackerInput,
  SubmitFeedbackInput,
} from "@/services/riflettSpine";

const STORAGE_KEY = "riflett.spine.queue";

type QueueKind = "feedback" | "failure";

export interface SpineQueueItemBase {
  id: string;
  kind: QueueKind;
  enqueuedAt: number;
  attempts: number;
}

export interface FeedbackQueueItem extends SpineQueueItemBase {
  kind: "feedback";
  payload: SubmitFeedbackInput;
}

export interface FailureQueueItem extends SpineQueueItemBase {
  kind: "failure";
  payload: FailureTrackerInput;
}

export type SpineQueueItem = FeedbackQueueItem | FailureQueueItem;

async function readQueue(): Promise<SpineQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SpineQueueItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.warn("[spineQueue] failed to read queue", error);
    return [];
  }
}

async function writeQueue(items: SpineQueueItem[]): Promise<void> {
  try {
    if (items.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn("[spineQueue] failed to persist queue", error);
  }
}

export async function enqueueSpineOperation(
  item: Omit<FeedbackQueueItem, "enqueuedAt" | "attempts"> |
    Omit<FailureQueueItem, "enqueuedAt" | "attempts">
): Promise<void> {
  const nextItem: SpineQueueItem = {
    ...item,
    enqueuedAt: Date.now(),
    attempts: 0,
  } as SpineQueueItem;

  const existing = await readQueue();
  existing.push(nextItem);
  await writeQueue(existing);
}

type DrainProcessors = {
  feedback: (item: FeedbackQueueItem) => Promise<void>;
  failure: (item: FailureQueueItem) => Promise<void>;
};

const MAX_ATTEMPTS = 3;

export async function drainSpineQueue(processors: DrainProcessors): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining: SpineQueueItem[] = [];

  for (const item of queue) {
    if (item.attempts >= MAX_ATTEMPTS) {
      console.warn("[spineQueue] dropping item after max attempts", item.id);
      continue;
    }

    try {
      const updated = { ...item, attempts: item.attempts + 1 } as SpineQueueItem;
      if (item.kind === "feedback") {
        await processors.feedback(updated as FeedbackQueueItem);
      } else {
        await processors.failure(updated as FailureQueueItem);
      }
    } catch (error) {
      console.warn("[spineQueue] processor failed", item.id, error);
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  await writeQueue(remaining);
}

export async function getQueuedCounts() {
  const queue = await readQueue();
  const counts = queue.reduce(
    (acc, item) => {
      acc[item.kind] += 1;
      return acc;
    },
    { feedback: 0, failure: 0 }
  );
  return counts;
}
