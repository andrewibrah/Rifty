/// <reference lib="deno.ns" />
/**
 * Analyst Query - RAG-powered Q&A with OpenAI
 * Answers questions about user's journal using relevant context
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { generateEmbedding } from "../_shared/embedding.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");
const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const MODEL_NAME = "gpt-4o-mini";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface RequestBody {
  query: string;
  limit?: number;
}

interface AnalystResult {
  answer: string;
  citations?: Array<{
    entry_id: string;
    date: string;
    snippet: string;
  }>;
  relevant_facts?: string[];
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

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
    const user = await requireUser(accessToken);

    const body: RequestBody = await req.json();
    const query = body.query?.trim();

    if (!query) {
      return jsonResponse(400, { error: "Query is required" });
    }

    const limit = Math.min(body.limit ?? 5, 10);

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Search for relevant entries
    const { data: entryMatches } = await supabaseClient.rpc(
      "match_entry_embeddings",
      {
        query_embedding: queryEmbedding,
        match_user_id: user.id,
        match_threshold: 0.45,
        match_count: limit * 2,
      }
    );

    // Fetch entry details
    const entries = [];
    if (
      entryMatches &&
      Array.isArray(entryMatches) &&
      entryMatches.length > 0
    ) {
      const entryIds = entryMatches.slice(0, limit).map((m: any) => m.entry_id);

      const { data: entryDetails } = await supabaseClient
        .from("entries")
        .select("id, content, type, created_at, entry_summaries(summary)")
        .in("id", entryIds);

      if (entryDetails) {
        for (const entry of entryDetails) {
          const summary =
            Array.isArray(entry.entry_summaries) &&
            entry.entry_summaries[0]?.summary;
          entries.push({
            id: entry.id,
            content: entry.content,
            type: entry.type,
            created_at: entry.created_at,
            summary: summary || entry.content.slice(0, 200),
          });
        }
      }
    }

    // Fetch user facts
    const { data: factsData } = await supabaseClient
      .from("user_facts")
      .select("fact")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const facts = factsData?.map((f: any) => f.fact) ?? [];

    // Build context
    const entryContext = entries
      .map(
        (e: any, idx: number) =>
          `[${idx + 1}] ${new Date(e.created_at).toLocaleDateString()} (${e.type}):\n${e.summary}`
      )
      .join("\n\n");

    const factsContext = facts.map((f: string) => `- ${f}`).join("\n");

    // Call OpenAI
    const systemPrompt = `You are Riflett, an analyst for the user's journal. Answer questions about their entries with:
- Patterns and insights
- Direct citations (reference entry dates)
- Concise, actionable answers (fit on one screen)
- Empathy and warmth

Context will include relevant past entries and learned facts about the user.`;

    const userPrompt = `Question: ${query}

Relevant Entries:
${entryContext || "No relevant entries found."}

Known Facts:
${factsContext || "No facts yet."}

Answer the question, citing specific entries by date.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "emit_answer",
          description: "Return answer with citations",
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["answer"],
            properties: {
              answer: { type: "string" },
              citations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entry_id: { type: "string" },
                    date: { type: "string" },
                    snippet: { type: "string" },
                  },
                },
              },
              relevant_facts: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "emit_answer" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error("Failed to generate answer");
    }

    const data = await response.json();
    const msg = data?.choices?.[0]?.message;
    const toolCall = msg?.tool_calls?.[0];
    const argStr = toolCall?.function?.arguments;

    if (!argStr) {
      throw new Error("Missing tool call in OpenAI response");
    }

    const result: AnalystResult = JSON.parse(argStr);

    return jsonResponse(200, result);
  } catch (error: any) {
    console.error("[analyst_query] Error:", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message || "Unknown error",
    });
  }
});
