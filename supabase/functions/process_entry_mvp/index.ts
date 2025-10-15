/// <reference lib="deno.ns" />
/**
 * MVP Enhanced Entry Processing
 * Handles: Classification → Summary → Embedding → Goal Detection → Reflection
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const getEnv = (key: string) =>
  typeof Deno !== "undefined" ? Deno.env.get(key) : process.env[key];

const SUPABASE_URL = getEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SERVICE_ROLE_KEY");
const OPENAI_API_KEY = getEnv("OPENAI_API_KEY");
const OPENAI_MODEL = getEnv("OPENAI_MODEL") ?? "gpt-4o-mini";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface ProcessedEntry {
  entry: Record<string, any>;
  summary: Record<string, any>;
  embedding_stored: boolean;
  goal_detected: boolean;
  goal?: Record<string, any>;
  reflection: string;
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callOpenAI(messages: any[], tools: any[], toolName: string) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      messages,
      tools,
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenAI API error", response.status, errorText);
    throw new Error("OpenAI API call failed");
  }

  const data = await response.json();
  const msg = data?.choices?.[0]?.message;
  const toolCall = msg?.tool_calls?.[0];
  const argStr = toolCall?.function?.arguments;

  if (!argStr) {
    throw new Error("Missing tool call in response");
  }

  return JSON.parse(argStr);
}

async function classifyContent(content: string) {
  const schema = {
    name: "intent_classification",
    schema: {
      type: "object",
      required: ["intent", "confidence", "rationale"],
      properties: {
        intent: { type: "string", enum: ["journal", "goal", "schedule", "unknown"] },
        confidence: { type: "number" },
        rationale: { type: "string" },
      },
    },
  };

  return callOpenAI(
    [
      {
        role: "system",
        content:
          "Classify user reflections into: journal (personal), goal (objectives), schedule (time-bound), or unknown.",
      },
      { role: "user", content },
    ],
    [{ type: "function", function: schema }],
    "intent_classification"
  );
}

async function summarizeEntry(content: string, entryType: string) {
  const schema = {
    name: "emit_summary",
    schema: {
      type: "object",
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
  };

  return callOpenAI(
    [
      {
        role: "system",
        content: `Analyze the user's ${entryType} entry and provide summary, emotion, topics, urgency, suggested action, blockers, dates, and a brief warm reflection (1-2 sentences).`,
      },
      { role: "user", content },
    ],
    [{ type: "function", function: schema }],
    "emit_summary"
  );
}

async function detectGoal(content: string) {
  const schema = {
    name: "emit_goal_detection",
    schema: {
      type: "object",
      required: ["goal_detected"],
      properties: {
        goal_detected: { type: "boolean" },
        suggested_title: { type: "string" },
        suggested_description: { type: "string" },
        suggested_category: { type: "string" },
        suggested_micro_steps: { type: "array", items: { type: "string" } },
      },
    },
  };

  return callOpenAI(
    [
      {
        role: "system",
        content:
          "Detect if entry implies a goal. If yes, extract title, description, category, and 2-3 micro-steps.",
      },
      { role: "user", content },
    ],
    [{ type: "function", function: schema }],
    "emit_goal_detection"
  );
}

async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    console.error("Embedding API error", response.status);
    throw new Error("Failed to generate embedding");
  }

  const data = await response.json();
  return data?.data?.[0]?.embedding ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing or invalid Authorization" });
    }

    const accessToken = authHeader.slice(7).trim();
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return jsonResponse(401, { error: "Invalid access token" });
    }

    const userId = authData.user.id;
    const requestBody = await req.json().catch(() => ({}));
    const content = typeof requestBody?.content === "string" ? requestBody.content.trim() : "";

    if (!content) {
      return jsonResponse(400, { error: "Content is required" });
    }

    // Step 1: Classify
    const classification = await classifyContent(content);
    const intent = classification.intent;
    const finalType = intent === "goal" || intent === "schedule" ? intent : "journal";

    // Step 2: Create entry
    const { data: insertedEntry, error: insertError } = await supabaseClient
      .from("entries")
      .insert({
        user_id: userId,
        type: finalType,
        content,
        ai_intent: intent,
        ai_confidence: classification.confidence,
        ai_meta: {
          rationale: classification.rationale,
          model: OPENAI_MODEL,
          version: "mvp-2025-01-14",
        },
        source: "user",
      })
      .select()
      .single();

    if (insertError || !insertedEntry) {
      console.error("Failed to insert entry", insertError);
      return jsonResponse(500, { error: "Failed to create entry" });
    }

    const entryId = insertedEntry.id;

    // Step 3: Summarize (background, non-blocking)
    let summaryData: any = null;
    let reflection = "Saved. Keep going.";
    try {
      const summaryResult = await summarizeEntry(content, finalType);
      reflection = summaryResult.reflection ?? reflection;

      const { data: summary } = await supabaseClient.from("entry_summaries").insert({
        entry_id: entryId,
        user_id: userId,
        summary: summaryResult.summary,
        emotion: summaryResult.emotion ?? null,
        topics: summaryResult.topics ?? [],
        people: summaryResult.people ?? [],
        urgency_level: summaryResult.urgency_level ?? null,
        suggested_action: summaryResult.suggested_action ?? null,
        blockers: summaryResult.blockers ?? null,
        dates_mentioned: summaryResult.dates_mentioned ?? null,
      }).select().single();

      summaryData = summary;
    } catch (err) {
      console.error("Summarization failed (non-critical)", err);
    }

    // Step 4: Generate embedding (background, non-blocking)
    let embeddingStored = false;
    try {
      const embedding = await generateEmbedding(content);
      await supabaseClient.from("entry_embeddings").insert({
        entry_id: entryId,
        user_id: userId,
        embedding: JSON.stringify(embedding),
        model: "text-embedding-3-small",
      });
      embeddingStored = true;
    } catch (err) {
      console.error("Embedding failed (non-critical)", err);
    }

    // Step 5: Detect goal (background, non-blocking)
    let goalDetected = false;
    let goalData: any = null;
    try {
      const goalResult = await detectGoal(content);
      if (goalResult.goal_detected && goalResult.suggested_title) {
        const microSteps = (goalResult.suggested_micro_steps ?? []).map(
          (desc: string, idx: number) => ({
            id: `${Date.now()}-${idx}`,
            description: desc,
            completed: false,
          })
        );

        const { data: goal } = await supabaseClient.from("goals").insert({
          user_id: userId,
          title: goalResult.suggested_title,
          description: goalResult.suggested_description ?? null,
          category: goalResult.suggested_category ?? null,
          source_entry_id: entryId,
          micro_steps: microSteps,
          status: "active",
        }).select().single();

        goalDetected = true;
        goalData = goal;
      }
    } catch (err) {
      console.error("Goal detection failed (non-critical)", err);
    }

    const result: ProcessedEntry = {
      entry: insertedEntry,
      summary: summaryData,
      embedding_stored: embeddingStored,
      goal_detected: goalDetected,
      goal: goalData,
      reflection,
    };

    return jsonResponse(200, result);
  } catch (error) {
    console.error("Unhandled error in process_entry_mvp", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
