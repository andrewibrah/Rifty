/// <reference lib="deno.ns" />
/**
 * create_user_fact edge function
 * Creates a user fact with server-side validation and confidence scoring
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

interface CreateUserFactRequest {
  fact?: string;
  category?: string;
  confidence?: number;
  source_entry_ids?: string[];
}

interface UserFact {
  id: string;
  user_id: string;
  fact: string;
  category: string | null;
  confidence: number;
  source_entry_ids: string[];
  last_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

function validateFactQuality(fact: string): {
  valid: boolean;
  reason?: string;
} {
  if (!fact || fact.trim().length === 0) {
    return { valid: false, reason: "Fact cannot be empty" };
  }

  if (fact.trim().length < 3) {
    return { valid: false, reason: "Fact too short" };
  }

  if (fact.trim().length > 1000) {
    return { valid: false, reason: "Fact too long (max 1000 characters)" };
  }

  return { valid: true };
}

function normalizeConfidence(confidence?: number): number {
  if (typeof confidence !== "number") {
    return 0.8; // Default confidence
  }

  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, confidence));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing or invalid authorization" });
    }

    const accessToken = authHeader.slice(7).trim();
    let user;
    try {
      user = await requireUser(accessToken);
    } catch {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body: CreateUserFactRequest = await req.json().catch(() => ({}));
    const fact = typeof body.fact === "string" ? body.fact.trim() : "";

    if (!fact) {
      return jsonResponse(400, { error: "fact is required" });
    }

    // Validate fact quality
    const validation = validateFactQuality(fact);
    if (!validation.valid) {
      return jsonResponse(400, { error: validation.reason });
    }

    const category =
      typeof body.category === "string" && body.category.trim().length > 0
        ? body.category.trim()
        : null;

    const confidence = normalizeConfidence(body.confidence);

    const sourceEntryIds = Array.isArray(body.source_entry_ids)
      ? body.source_entry_ids.filter((id) => typeof id === "string")
      : [];

    // Insert user fact
    const { data, error } = await supabaseAdminClient
      .from("user_facts")
      .insert({
        user_id: user.id,
        fact,
        category,
        confidence,
        source_entry_ids: sourceEntryIds,
      })
      .select()
      .single();

    if (error) {
      console.error("[create_user_fact] Insert error:", error);
      return jsonResponse(500, { error: "Failed to create user fact" });
    }

    return jsonResponse(200, data as UserFact);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[create_user_fact] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
