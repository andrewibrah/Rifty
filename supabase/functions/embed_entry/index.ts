/// <reference lib="deno.ns" />
/**
 * embed_entry edge function
 * Generates an embedding for the provided text and stores it for an entry.
 * This combines generate_embedding + store_entry_embedding in one call.
 */

import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import { generateEmbedding } from "../_shared/embedding.ts";

const EMBEDDING_MODEL =
  Deno.env.get("EMBEDDING_MODEL") ?? "text-embedding-3-small";

interface EmbedEntryRequest {
  entry_id?: string;
  content?: string;
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

    const body: EmbedEntryRequest = await req.json().catch(() => ({}));
    const entryId =
      typeof body.entry_id === "string" && body.entry_id.length > 0
        ? body.entry_id
        : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!entryId) {
      return jsonResponse(400, { error: "entry_id is required" });
    }

    if (!isValidUUID(entryId)) {
      return jsonResponse(400, { error: "Invalid entry_id format" });
    }

    if (!content) {
      return jsonResponse(400, { error: "content is required" });
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

    // Generate embedding
    const embedding = await generateEmbedding(content);

    // Store the embedding
    const payload = {
      entry_id: entryId,
      user_id: user.id,
      embedding,
      model: EMBEDDING_MODEL,
    };

    const { data, error } = await supabaseAdminClient
      .from("entry_embeddings")
      .upsert(payload, { onConflict: "entry_id" })
      .select()
      .single();

    if (error) {
      console.error("[embed_entry] Upsert error:", error);
      return jsonResponse(500, { error: "Failed to store embedding" });
    }

    return jsonResponse(200, data ?? {});
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[embed_entry] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
