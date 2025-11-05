import { describe, expect, it } from "vitest";
import { computeTrustWeight } from "@/services/trustWeight";

describe("computeTrustWeight", () => {
  it("decays below 0.6 for stale unconfirmed memories", () => {
    const weight = computeTrustWeight(30, false, 0);
    expect(weight).toBeLessThan(0.6);
  });

  it("rewards recent confirmed anchors", () => {
    const weight = computeTrustWeight(2, true, 0.4);
    expect(weight).toBeGreaterThanOrEqual(0.7);
    expect(weight).toBeLessThanOrEqual(1);
  });
});
