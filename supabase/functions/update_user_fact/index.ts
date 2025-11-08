/// <reference lib="deno.ns" />
/**
 * update_user_fact edge function
 * Updates a user fact with server-side validation
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

interface UpdateUserFactRequest {
  fact_id?: string;
  fact?: string;
  confidence?: number;
  last_confirmed_at?: string;
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

function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
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

function normalizeConfidence(confidence?: number): number | undefined {
  if (typeof confidence !== "number") {
    return undefined;
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

    const body: UpdateUserFactRequest = await req.json().catch(() => ({}));
    const factId =
      typeof body.fact_id === "string" && body.fact_id.length > 0
        ? body.fact_id
        : "";

    if (!factId) {
      return jsonResponse(400, { error: "fact_id is required" });
    }

    if (!isValidUUID(factId)) {
      return jsonResponse(400, { error: "Invalid fact_id format" });
    }

    // Build updates object
    const updates: Record<string, any> = {};

    if (body.fact !== undefined) {
      const fact = typeof body.fact === "string" ? body.fact.trim() : "";
      const validation = validateFactQuality(fact);
      if (!validation.valid) {
        return jsonResponse(400, { error: validation.reason });
      }
      updates.fact = fact;
    }

    if (body.confidence !== undefined) {
      const confidence = normalizeConfidence(body.confidence);
      if (confidence !== undefined) {
        updates.confidence = confidence;
      }
    }

    if (body.last_confirmed_at !== undefined) {
      updates.last_confirmed_at = body.last_confirmed_at;
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse(400, { error: "No valid updates provided" });
    }

    // Verify fact exists and belongs to user
    const { data: existingFact, error: fetchError } = await supabaseAdminClient
      .from("user_facts")
      .select("id, user_id")
      .eq("id", factId)
      .single();

    if (fetchError || !existingFact || existingFact.user_id !== user.id) {
      return jsonResponse(404, { error: "User fact not found" });
    }

    // Update user fact
    const { data, error } = await supabaseAdminClient
      .from("user_facts")
      .update(updates)
      .eq("id", factId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[update_user_fact] Update error:", error);
      return jsonResponse(500, { error: "Failed to update user fact" });
    }

    return jsonResponse(200, data as UserFact);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[update_user_fact] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
