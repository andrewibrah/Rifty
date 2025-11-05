import Constants from "expo-constants";

export function getFlag(key: string, fallback = false): boolean {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const envValue = typeof process?.env?.[key] === "string" ? process.env[key] : undefined;
  const raw = (envValue ?? extra[key] ?? extra[`EXPO_PUBLIC_${key}`]) as unknown;

  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

export function isGoalsV2Enabled(): boolean {
  return getFlag("RIFLETT_GOALS_V2", false);
}

export function getLinkThreshold(): number {
  const raw = process?.env?.RIFLETT_LINK_THRESHOLD ??
    ((Constants.expoConfig?.extra ?? {}) as Record<string, unknown>)["RIFLETT_LINK_THRESHOLD"];
  const parsed = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : undefined;
  if (parsed && Number.isFinite(parsed)) {
    return parsed;
  }
  return 0.82;
}

export function getDedupeThreshold(): number {
  const raw = process?.env?.RIFLETT_DEDUPE_THRESHOLD ??
    ((Constants.expoConfig?.extra ?? {}) as Record<string, unknown>)["RIFLETT_DEDUPE_THRESHOLD"];
  const parsed = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : undefined;
  if (parsed !== undefined && Number.isFinite(parsed)) {
    return parsed;
  }
  return 0.9;
}
