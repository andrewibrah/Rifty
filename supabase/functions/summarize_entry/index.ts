/// <reference lib="deno.ns" />
/**
 * summarize_entry edge function
 * Performs OpenAI-powered summarization and optionally stores the result.
 */

import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const MODEL_NAME = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

interface SummarizeEntryRequest {
  content?: string;
  entryType?: string;
  entryId?: string;
  store?: boolean;
}

interface SummarizeEntryResult {
  summary: string;
  emotion?: string;
  topics?: string[];
  people?: string[];
  urgency_level?: number;
  suggested_action?: string;
  blockers?: string;
  dates_mentioned?: string[];
  reflection: string;
}

interface SummarizeEntryResponse {
  summary: SummarizeEntryResult;
  stored_summary?: Record<string, unknown> | null;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

async function callOpenAI(
  content: string,
  entryType: string
): Promise<SummarizeEntryResult> {
  const systemPrompt = `You are Riflett, a reflective coach. Analyze the user's entry and provide:
1. A 2-3 line summary (no fluff)
2. Core emotion (single word or phrase)
3. Topic tags (max 5, lowercase)
4. People mentioned (names only)
5. Urgency level (0-10)
6. One suggested next action
7. Any blockers mentioned
8. Dates/deadlines mentioned
9. A brief reflection (1-2 sentences, warm and constructive)

Entry type: ${entryType}`;

  const tools = [
    {
      type: "function",
      function: {
        name: "emit_summary",
        description: "Return structured summary and reflection for the entry",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "reflection"],
          properties: {
            summary: { type: "string" },
            emotion: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
            people: { type: "array", items: { type: "string" } },
            urgency_level: { type: "number", minimum: 0, maximum: 10 },
            suggested_action: { type: "string" },
            blockers: { type: "string" },
            dates_mentioned: { type: "array", items: { type: "string" } },
            reflection: { type: "string" },
          },
        },
      },
    },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
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
          { role: "user", content },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "emit_summary" } },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.error(
        "[summarize_entry] OpenAI error:",
        response.status,
        message
      );
      throw new Error("OpenAI summarization failed");
    }

    const data = await response.json();
    const msg = data?.choices?.[0]?.message;
    const toolCall = msg?.tool_calls?.[0];
    const argStr: string | undefined = toolCall?.function?.arguments;

    if (!argStr) {
      throw new Error("OpenAI response missing tool call");
    }

    const parsed = JSON.parse(argStr) as SummarizeEntryResult;
    if (!parsed.summary || !parsed.reflection) {
      throw new Error("Invalid summary payload from OpenAI");
    }

    return parsed;
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
    let user;
    try {
      user = await requireUser(accessToken);
    } catch {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body: SummarizeEntryRequest = await req.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return jsonResponse(400, { error: "Content is required" });
    }

    const entryType =
      typeof body.entryType === "string" && body.entryType.length > 0
        ? body.entryType
        : "journal";
    const entryId =
      typeof body.entryId === "string" && body.entryId.length > 0
        ? body.entryId
        : undefined;
    const shouldStore = Boolean(body.store) && Boolean(entryId);

    const summary = await callOpenAI(content, entryType);

    let storedSummary: Record<string, unknown> | null = null;

    if (shouldStore && entryId) {
      try {
        const { data: entryRecord, error: entryError } =
          await supabaseAdminClient
            .from("entries")
            .select("id, user_id")
            .eq("id", entryId)
            .single();

        if (entryError || !entryRecord || entryRecord.user_id !== user.id) {
          throw new Error("Entry not found or access denied");
        }

        const insertPayload = {
          entry_id: entryId,
          user_id: user.id,
          summary: summary.summary,
          emotion: summary.emotion ?? null,
          topics: summary.topics ?? [],
          people: summary.people ?? [],
          urgency_level: summary.urgency_level ?? null,
          suggested_action: summary.suggested_action ?? null,
          blockers: summary.blockers ?? null,
          dates_mentioned: summary.dates_mentioned ?? null,
        };

        const { data: inserted, error: insertError } = await supabaseAdminClient
          .from("entry_summaries")
          .insert(insertPayload)
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        storedSummary = inserted ?? null;
      } catch (storeError) {
        console.error("[summarize_entry] Failed to store summary:", storeError);
      }
    }

    const response: SummarizeEntryResponse = {
      summary,
      stored_summary: storedSummary,
    };

    return jsonResponse(200, response);
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[summarize_entry] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
