export function computeTrustWeight(
  recencyDays: number,
  confirmed: boolean,
  sentiment: number
): number {
  const base =
    0.35 +
    0.4 * (1 / (1 + recencyDays / 7)) +
    (confirmed ? 0.2 : 0) +
    0.05 * sentiment;

  if (!Number.isFinite(base)) {
    return 0.35;
  }

  return Math.min(1, Math.max(0, base));
}
