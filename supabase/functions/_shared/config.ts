export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const getEnv = (key: string): string | undefined =>
  typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;

export function getNumberEnv(
  key: string,
  fallback: number | undefined = undefined
): number | undefined {
  const raw = getEnv(key);
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

export function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
