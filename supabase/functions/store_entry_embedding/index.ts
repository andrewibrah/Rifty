/// <reference lib="deno.ns" />
/**
 * store_entry_embedding edge function
 * Persists an entry embedding for the authenticated user.
 */

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

const EMBEDDING_MODEL =
  Deno.env.get("EMBEDDING_MODEL") ?? "text-embedding-3-small";

interface StoreEntryEmbeddingRequest {
  entry_id?: string;
  embedding?: unknown;
  model?: string;
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

    const body: StoreEntryEmbeddingRequest = await req.json().catch(() => ({}));
    const entryId =
      typeof body.entry_id === "string" && body.entry_id.length > 0
        ? body.entry_id
        : "";
    const embedding = Array.isArray(body.embedding) ? body.embedding : null;
    const model =
      typeof body.model === "string" && body.model.length > 0
        ? body.model
        : EMBEDDING_MODEL;

    if (!entryId) {
      return jsonResponse(400, { error: "entry_id is required" });
    }

    if (!isValidUUID(entryId)) {
      return jsonResponse(400, { error: "Invalid entry_id format" });
    }

    if (!embedding || embedding.length === 0) {
      return jsonResponse(400, {
        error: "embedding is required and must be a non-empty array",
      });
    }

    // Verify entry exists and belongs to user
    const { data: entryRecord, error: entryError } = await supabaseAdminClient
      .from("entries")
      .select("id, user_id")
      .eq("id", entryId)
      .single();

    if (entryError || !entryRecord || entryRecord.user_id !== user.id) {
      return jsonResponse(404, { error: "Entry not found" });
    }

    // Store the embedding
    const payload = {
      entry_id: entryId,
      user_id: user.id,
      embedding,
      model,
    };

    const { data, error } = await supabaseAdminClient
      .from("entry_embeddings")
      .upsert(payload, { onConflict: "entry_id" })
      .select()
      .single();

    if (error) {
      console.error("[store_entry_embedding] Upsert error:", error);
      return jsonResponse(500, { error: "Failed to store embedding" });
    }

    return jsonResponse(200, data ?? {});
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[store_entry_embedding] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
