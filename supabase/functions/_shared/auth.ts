import type { User } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { supabaseAdminClient } from "./client.ts";
import { getEnv, getNumberEnv, requireEnv } from "./config.ts";

export type AppUserRole = "user" | "admin" | "service";

export interface AuthContext {
  user: User;
  role: AppUserRole;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function extractRole(user: User): AppUserRole {
  const roleCandidates: Array<unknown> = [];
  const appRoles = user.app_metadata?.roles;
  if (Array.isArray(appRoles)) {
    roleCandidates.push(...appRoles);
  }
  roleCandidates.push(
    user.app_metadata?.role,
    user.user_metadata?.role,
    user.app_metadata?.default_role
  );

  for (const candidate of roleCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = candidate.trim().toLowerCase();
    if (normalized === "admin" || normalized === "service") {
      return normalized as AppUserRole;
    }
  }

  return "user";
}

const PROJECT_URL = requireEnv("PROJECT_URL").replace(/\/$/, "");
const DEFAULT_ISSUER = `${PROJECT_URL}/auth/v1`;
const EXPECTED_ISSUER = getEnv("AUTH_JWT_ISSUER") ?? DEFAULT_ISSUER;
const EXPECTED_AUDIENCE = getEnv("AUTH_JWT_AUDIENCE") ?? "authenticated";
const CLOCK_SKEW_SECONDS =
  getNumberEnv("AUTH_JWT_ALLOWED_CLOCK_SKEW_SECONDS", 120) ?? 120;

interface JwtClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  [key: string]: unknown;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  try {
    return atob(padded);
  } catch {
    throw new AuthError("Invalid token encoding", 401);
  }
}

function parseJwtClaims(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new AuthError("Invalid access token format", 401);
  }
  const payload = decodeBase64Url(parts[1]);
  try {
    return JSON.parse(payload);
  } catch {
    throw new AuthError("Invalid token payload", 401);
  }
}

function normalizeAudience(aud: unknown): string[] {
  if (typeof aud === "string") {
    return [aud];
  }
  if (Array.isArray(aud)) {
    return aud.filter((value): value is string => typeof value === "string");
  }
  return [];
}

function validateJwtClaims(token: string) {
  const claims = parseJwtClaims(token);
  if (!claims.iss || claims.iss !== EXPECTED_ISSUER) {
    throw new AuthError("Token issuer mismatch", 401);
  }

  const audiences = normalizeAudience(claims.aud);
  if (!audiences.includes(EXPECTED_AUDIENCE)) {
    throw new AuthError("Token audience mismatch", 401);
  }

  const nowSeconds = Date.now() / 1000;
  if (
    typeof claims.exp === "number" &&
    nowSeconds - CLOCK_SKEW_SECONDS >= claims.exp
  ) {
    throw new AuthError("Token expired", 401);
  }

  if (
    typeof claims.nbf === "number" &&
    claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS
  ) {
    throw new AuthError("Token not yet valid", 401);
  }
}

export async function requireAuthContext(req: Request): Promise<AuthContext> {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid authorization header", 401);
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new AuthError("Missing access token", 401);
  }

  validateJwtClaims(accessToken);

  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new AuthError("Unauthorized", 401);
  }

  return { user: data.user, role: extractRole(data.user) };
}

export function enforceRoles(role: AppUserRole, allowed: AppUserRole[]) {
  if (!allowed.includes(role)) {
    throw new AuthError("Forbidden", 403);
  }
}
