import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, string>();

const asyncStorageMock = {
  getItem: vi.fn(async (key: string) =>
    store.has(key) ? store.get(key)! : null
  ),
  setItem: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    store.delete(key);
  }),
};

vi.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: asyncStorageMock,
}));

describe("Outbox.queue", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("queues jobs without dropping when called concurrently", async () => {
    const { Outbox } = await import("@/agent/outbox");

    const jobs = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        Outbox.queue({ kind: "polish", payload: { index } })
      )
    );

    expect(jobs).toHaveLength(10);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(10);

    const allJobs = await Outbox.list();
    expect(allJobs).toHaveLength(10);

    const payloads = allJobs
      .map((job) => (job.payload as { index: number }).index)
      .sort((a, b) => a - b);
    expect(payloads).toEqual(Array.from({ length: 10 }, (_, i) => i));
  });

  it("clears jobs safely under concurrent access", async () => {
    const { Outbox } = await import("@/agent/outbox");

    const jobs = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        Outbox.queue({ kind: "polish", payload: { index } })
      )
    );

    const [target, ...rest] = jobs;

    await Promise.all([
      Outbox.clear(target.id),
      Outbox.queue({ kind: "polish", payload: { index: 99 } }),
    ]);

    const remaining = await Outbox.list();

    expect(remaining.find((job) => job.id === target.id)).toBeUndefined();
    expect(remaining).toHaveLength(rest.length + 1);
  });
});
