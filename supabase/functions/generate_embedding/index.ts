/// <reference lib="deno.ns" />
/**
 * generate_embedding edge function
 * Generates an OpenAI embedding for the provided text.
 */

import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const EMBEDDING_MODEL =
  Deno.env.get("EMBEDDING_MODEL") ?? "text-embedding-3-small";

interface GenerateEmbeddingRequest {
  text?: string;
}

interface GenerateEmbeddingResponse {
  embedding: number[];
  model: string;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

async function callOpenAI(text: string): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.error(
        "[generate_embedding] OpenAI error:",
        response.status,
        message
      );
      throw new Error("Failed to generate embedding");
    }

    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Invalid embedding response from OpenAI");
    }

    return embedding;
  } finally {
    clearTimeout(timeout);
  }
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
    try {
      await requireUser(accessToken);
    } catch {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body: GenerateEmbeddingRequest = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return jsonResponse(400, { error: "Text is required" });
    }

    const embedding = await callOpenAI(text);

    const response: GenerateEmbeddingResponse = {
      embedding,
      model: EMBEDDING_MODEL,
    };

    return jsonResponse(200, response);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[generate_embedding] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
