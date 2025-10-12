/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL environment variable");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const allowedIntents = new Set(["journal", "goal", "schedule", "unknown"]);

interface ClassificationResult {
  intent: "journal" | "goal" | "schedule" | "unknown";
  confidence: number;
  rationale: string;
}

const schema = {
  name: "intent_classification",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "confidence", "rationale"],
    properties: {
      intent: {
        type: "string",
        enum: ["journal", "goal", "schedule", "unknown"],
      },
      confidence: { type: "number" },
      rationale: { type: "string" },
    },
  },
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function classifyContent(content: string): Promise<ClassificationResult> {
  if (!OPENAI_API_KEY) {
    return {
      intent: "unknown",
      confidence: 0,
      rationale:
        "OpenAI API key not configured; using fallback classification.",
    };
  }

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
    messages: [
      {
        role: "system",
        content:
          "You classify short user reflections into intents: journal (personal reflections), goal (objectives or targets), schedule (time-bound plans), or unknown. Respond with strict JSON following the provided schema.",
      },
      {
        role: "user",
        content,
      },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenAI classification failed", response.status, errorText);
    return {
      intent: "unknown",
      confidence: 0,
      rationale: "Model call failed; defaulting to fallback classification.",
    };
  }

  const result = await response.json();
  const messageContent = result?.choices?.[0]?.message?.content;

  try {
    let parsed: unknown;
    if (Array.isArray(messageContent)) {
      const outputPart = messageContent.find(
        (part: any) => part?.type === "output_text"
      );
      if (outputPart?.text) {
        parsed = JSON.parse(outputPart.text);
      }
    } else if (typeof messageContent === "string") {
      parsed = JSON.parse(messageContent);
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Parsed classification is not an object");
    }

    const { intent, confidence, rationale } = parsed as ClassificationResult;

    if (!allowedIntents.has(intent)) {
      throw new Error(`Invalid intent returned: ${intent}`);
    }

    const confidenceValue = Number(confidence);
    return {
      intent,
      confidence: Number.isFinite(confidenceValue)
        ? Math.max(0, Math.min(confidenceValue, 1))
        : 0,
      rationale: typeof rationale === "string" ? rationale : "",
    };
  } catch (error) {
    console.error("Failed to parse OpenAI response", error);
    return {
      intent: "unknown",
      confidence: 0,
      rationale: "Unable to parse model output; using fallback classification.",
    };
  }
}

Deno.serve({
  onRequest: async (req) => {
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
        return jsonResponse(401, {
          error: "Missing or invalid Authorization header",
        });
      }

      const accessToken = authHeader.slice(7).trim();
      if (!accessToken) {
        return jsonResponse(401, { error: "Missing access token" });
      }

      const { data: authData, error: authError } =
        await supabaseClient.auth.getUser(accessToken);

      if (authError || !authData?.user) {
        console.error("Auth verification failed", authError);
        return jsonResponse(401, { error: "Invalid access token" });
      }

      const userId = authData.user.id;

      const requestBody = await req.json().catch(() => ({}));
      const content =
        typeof requestBody?.content === "string"
          ? requestBody.content.trim()
          : "";

      if (!content) {
        return jsonResponse(400, { error: "Content is required" });
      }

      const classification = await classifyContent(content);
      const intent = classification.intent;
      const finalType =
        intent === "goal" || intent === "schedule" ? intent : "journal";

      const aiMeta = {
        rationale: classification.rationale,
        model: OPENAI_MODEL,
        version: "2025-01-08",
        intent,
      };

      const { data: insertedEntry, error: insertError } = await supabaseClient
        .from("entries")
        .insert({
          user_id: userId,
          type: finalType,
          content,
          ai_intent: intent,
          ai_confidence: classification.confidence,
          ai_meta: aiMeta,
          source: "user",
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to insert entry", insertError);
        return jsonResponse(500, { error: "Failed to create entry" });
      }

      return jsonResponse(200, insertedEntry as Record<string, unknown>);
    } catch (error) {
      console.error("Unhandled error in classify_and_create_entry", error);
      return jsonResponse(500, { error: "Internal server error" });
    }
  },
});
