import { supabase } from "../lib/supabase";
import type {
  EntryEmbedding,
  CreateEntryEmbeddingParams,
  SimilarEntry,
} from "../types/mvp";
import { isUUID } from "../utils/uuid";

const EMBEDDING_MODEL = "text-embedding-3-small";

interface GenerateEmbeddingResponse {
  embedding: number[];
  model: string;
}

/**
 * Generate an embedding for a given text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { data, error } =
    await supabase.functions.invoke<GenerateEmbeddingResponse>(
      "generate_embedding",
      {
        method: "POST",
        body: { text },
      }
    );

  if (error) {
    console.error("[generateEmbedding] Edge function error:", error);
    throw error;
  }

  if (!data?.embedding || !Array.isArray(data.embedding)) {
    throw new Error("generate_embedding edge function returned invalid data");
  }

  return data.embedding;
}

/**
 * Store an embedding for an entry
 */
export async function storeEntryEmbedding(
  params: CreateEntryEmbeddingParams
): Promise<EntryEmbedding> {
  if (!isUUID(params.entry_id)) {
    throw new Error("Invalid entry id for embedding storage");
  }

  const { data, error } = await supabase.functions.invoke<EntryEmbedding>(
    "store_entry_embedding",
    {
      method: "POST",
      body: {
        entry_id: params.entry_id,
        embedding: params.embedding,
        model: params.model ?? EMBEDDING_MODEL,
      },
    }
  );

  if (error) {
    console.error("[storeEntryEmbedding] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("store_entry_embedding edge function returned no data");
  }

  return data;
}

/**
 * Generate and store embedding for an entry
 */
export async function embedEntry(
  entryId: string,
  content: string
): Promise<EntryEmbedding> {
  if (!isUUID(entryId)) {
    throw new Error("Invalid entry id for embedding generation");
  }

  const { data, error } = await supabase.functions.invoke<EntryEmbedding>(
    "embed_entry",
    {
      method: "POST",
      body: {
        entry_id: entryId,
        content,
      },
    }
  );

  if (error) {
    console.error("[embedEntry] Edge function error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("embed_entry edge function returned no data");
  }

  return data;
}

/**
 * Find similar entries using cosine similarity
 */
export async function findSimilarEntries(
  queryText: string,
  options: {
    threshold?: number;
    limit?: number;
  } = {}
): Promise<SimilarEntry[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  const threshold = options.threshold ?? 0.7;
  const limit = options.limit ?? 5;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(queryText);

  // Use the match function from the database
  const { data, error } = await supabase.rpc("match_entry_embeddings", {
    query_embedding: queryEmbedding,
    match_user_id: user.id,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error("[findSimilarEntries] Error:", error);
    throw error;
  }

  return (data ?? []) as SimilarEntry[];
}

/**
 * Get entry embedding by entry ID
 */
export async function getEntryEmbedding(
  entryId: string
): Promise<EntryEmbedding | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  if (!isUUID(entryId)) {
    console.warn(
      "[getEntryEmbedding] Skipping lookup for invalid entry id",
      entryId
    );
    return null;
  }

  const { data, error } = await supabase
    .from("entry_embeddings")
    .select("*")
    .eq("entry_id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getEntryEmbedding] Error:", error);
    throw error;
  }

  return data as EntryEmbedding | null;
}

/**
 * Delete entry embedding
 */
export async function deleteEntryEmbedding(entryId: string): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("User not authenticated");
  }

  if (!isUUID(entryId)) {
    console.warn(
      "[deleteEntryEmbedding] Skipping delete for invalid entry id",
      entryId
    );
    return;
  }

  const { error } = await supabase
    .from("entry_embeddings")
    .delete()
    .eq("entry_id", entryId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[deleteEntryEmbedding] Error:", error);
    throw error;
  }
}
