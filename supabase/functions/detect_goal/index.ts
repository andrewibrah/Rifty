/// <reference lib="deno.ns" />
/**
 * detect_goal edge function
 * Uses OpenAI to determine whether an entry implies a goal and extracts details.
 */

import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";

const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const MODEL_NAME = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

interface DetectGoalRequest {
  content?: string;
}

interface GoalDetectionResult {
  goal_detected: boolean;
  suggested_title?: string;
  suggested_description?: string;
  suggested_category?: string;
  suggested_micro_steps?: string[];
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

async function callOpenAI(content: string): Promise<GoalDetectionResult> {
  const systemPrompt = `Analyze if this entry implies a goal or objective. If yes, extract:
- Suggested title (short, actionable)
- Description (1-2 sentences)
- Category (health, relationships, career, creativity, etc.)
- 2-3 micro-steps to start

Respond with structured JSON.`;

  const tools = [
    {
      type: "function",
      function: {
        name: "emit_goal_detection",
        description: "Return goal detection result",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["goal_detected"],
          properties: {
            goal_detected: { type: "boolean" },
            suggested_title: { type: "string" },
            suggested_description: { type: "string" },
            suggested_category: { type: "string" },
            suggested_micro_steps: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        tools,
        tool_choice: {
          type: "function",
          function: { name: "emit_goal_detection" },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.warn("[detect_goal] OpenAI error:", response.status, message);
      return { goal_detected: false };
    }

    const data = await response.json();
    const msg = data?.choices?.[0]?.message;
    const toolCall = msg?.tool_calls?.[0];
    const argStr: string | undefined = toolCall?.function?.arguments;

    if (!argStr) {
      return { goal_detected: false };
    }

    const parsed = JSON.parse(argStr) as GoalDetectionResult;

    if (typeof parsed.goal_detected !== "boolean") {
      return { goal_detected: false };
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
    try {
      await requireUser(accessToken);
    } catch {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body: DetectGoalRequest = await req.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return jsonResponse(400, { error: "Content is required" });
    }

    try {
      const result = await callOpenAI(content);
      return jsonResponse(200, result);
    } catch (aiError) {
      console.error("[detect_goal] OpenAI processing error:", aiError);
      return jsonResponse(200, { goal_detected: false });
    }
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    console.error("[detect_goal] Error:", error);
    return jsonResponse(500, { error: message });
  }
});
