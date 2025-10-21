import { getEnv } from "./config.ts";

const OPENAI_API_KEY = getEnv("OPENAI_API_KEY");
const EMBEDDING_MODEL = getEnv("EMBEDDING_MODEL") ?? "text-embedding-3-small";

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

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
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[embedding] OpenAI error", response.status, errorText);
    throw new Error("Failed to generate embedding");
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Invalid embedding response");
  }

  return embedding as number[];
}
