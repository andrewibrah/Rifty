import { describe, expect, it, vi } from "vitest";
import { retryWithBackoff } from "@/utils/retry";

describe("retryWithBackoff", () => {
  it("retries the configured number of times", async () => {
    const attempts: number[] = [];
    const wait = vi.fn().mockResolvedValue(undefined);
    let counter = 0;

    await expect(
      retryWithBackoff(
        async () => {
          attempts.push(counter++);
          throw new Error("fail");
        },
        { retries: 1, wait }
      )
    ).rejects.toThrow("fail");

    expect(attempts.length).toBe(2);
    expect(wait).toHaveBeenCalledOnce();
  });

  it("resolves when task eventually succeeds", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    let attempt = 0;
    const result = await retryWithBackoff(
      async () => {
        attempt += 1;
        if (attempt < 3) {
          throw new Error("try again");
        }
        return "ok";
      },
      { retries: 4, wait }
    );

    expect(result).toBe("ok");
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
