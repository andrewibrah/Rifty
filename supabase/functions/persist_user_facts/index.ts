// @ts-nocheck
/// <reference lib="deno.ns" />
/**
 * persist_user_facts - upserts fact records for the authenticated user
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface PersistedFactInput {
  key: string;
  value: unknown;
  confidence?: number;
  tags?: string[];
  source?: string;
}

const nowIso = () => new Date().toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing authorization" });
    }

    const accessToken = authHeader.slice(7);
    const { data: userResult, error: userError } =
      await supabaseClient.auth.getUser(accessToken);

    if (userError || !userResult?.user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const payload = await req.json().catch(() => ({}));
    const facts = Array.isArray(payload?.facts) ? payload.facts : [];

    if (!facts.length) {
      return jsonResponse(200, { upserted: 0 });
    }

    const rows = (facts as PersistedFactInput[])
      .filter((fact) => fact && typeof fact.key === "string" && fact.key.trim())
      .map((fact) => {
        const key = fact.key.trim();
        const normalizedKey = key.startsWith("facts:") ? key : `facts:${key}`;
        const tags = Array.isArray(fact.tags)
          ? fact.tags.filter((tag): tag is string => typeof tag === "string")
          : [];
        return {
          user_id: userResult.user.id,
          key: normalizedKey,
          value_json: {
            value: fact.value ?? null,
            confidence:
              typeof fact.confidence === "number" ? fact.confidence : null,
            tags,
            source: typeof fact.source === "string" ? fact.source : "main.chat",
            updated_at: nowIso(),
          },
          updated_at: nowIso(),
        };
      });

    if (!rows.length) {
      return jsonResponse(200, { upserted: 0 });
    }

    const { error: upsertError } = await supabaseClient
      .from("features")
      .upsert(rows, { onConflict: "user_id,key" });

    if (upsertError) {
      throw upsertError;
    }

    return jsonResponse(200, { upserted: rows.length });
  } catch (error: any) {
    console.error("[persist_user_facts] error", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message ?? "Unknown error",
    });
  }
});
