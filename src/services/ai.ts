import Constants from "expo-constants";
import type { Annotation, AnnotationChannel } from "../types/annotations";
import type {
  EntryNotePayload,
  IntentPredictionResult,
} from "../types/intent";
import type { EnrichedPayload, PlannerResponse } from "@/agent/types";

type AIResponse = {
  reply: string;
  learned: string;
  ethical: string;
};

// Use a model you actually have (from your list)
const MODEL_NAME = "gpt-4o-mini" as const;

const getExpoExtra = () =>
  (Constants?.expoConfig?.extra ?? {}) as Record<string, any>;

export function resolveOpenAIApiKey(explicit?: string): string {
  const extra = getExpoExtra();
  const apiKey =
    explicit ||
    extra?.openaiApiKey ||
    extra?.EXPO_PUBLIC_OPENAI_API_KEY ||
    extra?.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OpenAI API key is missing. Add EXPO_PUBLIC_OPENAI_API_KEY to your environment."
    );
  }

  return apiKey;
}

/** Build plain-text context from entry + prior annotations */
function buildContext(entryContent: string, annotations: Annotation[]): string {
  const history = annotations
    .map((a) => {
      const speaker = a.kind === "bot" ? "AI/Bot" : "User";
      const label = a.channel?.toUpperCase() ?? "NOTE";
      return `${speaker} (${label}) @ ${a.created_at ?? "unknown"}: ${a.content}`;
    })
    .join("\n");

  return [
    `Entry Summary: ${entryContent}`,
    history
      ? `Conversation History:\n${history}`
      : "Conversation History: none yet.",
  ].join("\n\n");
}

/** Main call: uses Chat Completions + tool/function calling for strict JSON */
export async function generateAIResponse(params: {
  apiKey?: string;
  entryContent: string;
  annotations: Annotation[];
  userMessage: string;
  entryType: string;
  intentContext?: {
    id: string;
    label: string;
    confidence: number;
    subsystem: string;
  };
}): Promise<AIResponse> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 45000);

  const apiKey = resolveOpenAIApiKey(params.apiKey);

  const context = buildContext(params.entryContent, params.annotations);

  const systemPrompt = `You are Riflett, a modern reflective coach.
Scope: ONLY respond for the entry-specific chat.
Tasks:
- For goals: provide coaching, options, techniques, and growth plans.
- For journals: analyze details, meanings, patterns; provide insights and enlightenment.
- For schedules: mental and readiness preparation.
You must emit your final data via the provided tool with keys: reply, learned, ethical. Keep reply concise, practical, empathetic.`;

  const intentContext = params.intentContext
    ? `On-device intent: ${params.intentContext.label} (${params.intentContext.id}) ` +
      `confidence ${(params.intentContext.confidence * 100).toFixed(1)}% ` +
      `subsystem ${params.intentContext.subsystem}.`
    : "";

  const userPrompt = `Entry category: ${params.entryType}
${intentContext ? `${intentContext}\n` : ""}
${context}

New user request: ${params.userMessage}`;

  // Define a single function/tool that encodes the schema we want back
  const tools = [
    {
      type: "function",
      function: {
        name: "emit_riflett_payload",
        description:
          "Return the final assistant message plus extracted learning about the user and the ethical/process steps used.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["reply", "learned", "ethical"],
          properties: {
            reply: {
              type: "string",
              description: "Warm, constructive answer for the user request.",
            },
            learned: {
              type: "string",
              description:
                "Direct summary of new insights about the user personality gleaned from this exchange.",
            },
            ethical: {
              type: "string",
              description:
                "Plain-English step-by-step outline of ethical and process responsibilities taken while crafting the reply.",
            },
          },
        },
      },
    },
  ] as const;

  const body = {
    model: MODEL_NAME,
    temperature: 0.7,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    // Force the model to call our function with JSON args
    tools,
    tool_choice: {
      type: "function",
      function: { name: "emit_riflett_payload" },
    },
  };

  let data: any;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.warn(`[OpenAI] ${res.status}: ${errorBody.slice(0, 200)}…`);
      throw new Error(
        res.status === 401
          ? "AI request unauthorized. Check API key."
          : "AI request failed. Please retry in a moment."
      );
    }

    data = await res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("AI request timed out. Please try again.");
    }
    console.warn("[OpenAI] request error", e?.message || e);
    throw new Error("AI request failed. Please retry in a moment.");
  } finally {
    clearTimeout(timeout);
  }

  // Tool/function calling: parse JSON from tool call arguments
  const msg = data?.choices?.[0]?.message;
  const toolCall = msg?.tool_calls?.[0];
  const argStr: string | undefined = toolCall?.function?.arguments;

  if (!argStr) {
    // Some models might put JSON into content as fallback; try that too
    const content = typeof msg?.content === "string" ? msg.content : "";
    if (!content) {
      throw new Error("OpenAI response missing tool call and content.");
    }
    try {
      const parsed = JSON.parse(stripCodeFences(content)) as AIResponse;
      validateAIResponse(parsed);
      return parsed;
    } catch {
      throw new Error("Unable to parse OpenAI response as JSON.");
    }
  }

  let parsed: AIResponse;
  try {
    parsed = JSON.parse(argStr) as AIResponse;
  } catch {
    throw new Error("Unable to parse tool call arguments as JSON.");
  }
  validateAIResponse(parsed);
  return parsed;
}

function stripCodeFences(s: string) {
  // Handles ```json ... ``` wrappers if they appear
  return s
    .replace(/^```(json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function validateAIResponse(p: any): asserts p is AIResponse {
  if (!p || typeof p !== "object")
    throw new Error("AI response not an object.");
  for (const k of ["reply", "learned", "ethical"] as const) {
    if (typeof p[k] !== "string" || !p[k].trim()) {
      throw new Error(`AI response missing required string field: ${k}`);
    }
  }
}

const ENTRY_NOTE_SCHEMA = {
  name: "riflett_entry_note_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["noteTitle", "noteBody", "searchTag", "guidance"],
    properties: {
      noteTitle: {
        type: "string",
        maxLength: 80,
        description: "Concise title for the entry's note surface.",
      },
      noteBody: {
        type: "string",
        maxLength: 600,
        description: "Short formative note capturing intent-informed details.",
      },
      searchTag: {
        type: "string",
        pattern: "^[a-z0-9\-]{2,60}$",
        description: "Lowercase kebab-case search tag.",
      },
      guidance: {
        type: "string",
        maxLength: 300,
        description:
          "Advice for the AI coach on how to follow up inside the main chat.",
      },
    },
  },
} as const;

export async function composeEntryNote(params: {
  userMessage: string;
  intent: IntentPredictionResult;
  enriched: EnrichedPayload;
  planner?: PlannerResponse | null;
  apiKey?: string;
}): Promise<EntryNotePayload> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const apiKey = resolveOpenAIApiKey(params.apiKey);
    const ctrl = new AbortController();
    timeout = setTimeout(() => ctrl.abort(), 30000);

    const systemPrompt = `You are Riflett's operating-system grade note composer. Analyse the user's message intent and craft a seed note that the interface can display before the AI replies. Keep the tone supportive, specific, and actionable.`;

    const intentMeta = params.enriched.intent;
    const context = params.enriched.contextSnippets.join("\n---\n");
    const plannerSummary = params.planner
      ? `\n[PLAN]\nAction: ${params.planner.action}\nPayload: ${JSON.stringify(
          params.planner.payload,
          null,
          2
        )}\nAsk: ${params.planner.ask ?? "null"}`
      : "";

    const userPrompt = `[INTENT]\n${intentMeta.label} (p=${intentMeta.confidence.toFixed(
      2
    )})\n\n[SLOTS]\n${JSON.stringify(intentMeta.slots, null, 2)}\n\n[CONTEXT]\n${
      context || "n/a"
    }\n\n[USER_CONFIG]\n${JSON.stringify(
      params.enriched.userConfig ?? {},
      null,
      2
    )}\n\n[USER]\n${params.enriched.userText}\n${plannerSummary}\n`;

    const body = {
      model: MODEL_NAME,
      temperature: 0.35,
      response_format: {
        type: "json_schema",
        json_schema: ENTRY_NOTE_SCHEMA,
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.warn("[OpenAI] composeEntryNote failed", response.status, errorBody);
      return buildFallbackNote(params.intent, params.userMessage);
    }

    const payload = await response.json();
    const message = payload?.choices?.[0]?.message;
    let raw = "";

    if (typeof message?.content === "string") {
      raw = message.content;
    } else if (Array.isArray(message?.content)) {
      const outputPart = message.content.find(
        (part: any) => part?.type === "output_text"
      );
      if (outputPart?.text) {
        raw = outputPart.text;
      }
    }

    if (!raw.trim()) {
      return buildFallbackNote(params.intent, params.userMessage);
    }

    let parsed: EntryNotePayload | null = null;
    try {
      parsed = JSON.parse(raw) as EntryNotePayload;
      validateEntryNote(parsed);
      const normalised: EntryNotePayload = {
        noteTitle: parsed.noteTitle.trim(),
        noteBody: parsed.noteBody.trim(),
        searchTag: sanitizeTag(parsed.searchTag),
        guidance: parsed.guidance.trim(),
      };

      if (!normalised.searchTag) {
        normalised.searchTag = sanitizeTag(params.intent.id);
      }

      return normalised;
    } catch (error) {
      console.warn("[OpenAI] composeEntryNote parse error", error);
      return buildFallbackNote(params.intent, params.userMessage);
    }
  } catch (error) {
    const err = error as any;
    if (err?.name === "AbortError") {
      console.warn("composeEntryNote aborted due to timeout");
    } else {
      console.warn("composeEntryNote failed", error);
    }
    const message = typeof err?.message === "string" ? err.message : "";
    err.offline =
      message.includes("Network request failed") ||
      message.includes("Failed to fetch");
    err.fallbackNote = buildFallbackNote(params.intent, params.userMessage);
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildFallbackNote(
  intent: IntentPredictionResult,
  message: string
): EntryNotePayload {
  const label = intent.label || intent.id;
  const tag = sanitizeTag(intent.id);
  const summary = message.slice(0, 240).trim();

  return {
    noteTitle: `${label} draft`,
    noteBody: summary || label,
    searchTag: tag || "journal-entry",
    guidance:
      "Fallback note generated locally. Ask the user for more specifics in the main chat.",
  };
}

function validateEntryNote(payload: any): asserts payload is EntryNotePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Entry note payload missing");
  }

  const requiredKeys: Array<keyof EntryNotePayload> = [
    "noteTitle",
    "noteBody",
    "searchTag",
    "guidance",
  ];

  for (const key of requiredKeys) {
    if (typeof payload[key] !== "string" || !payload[key].trim()) {
      throw new Error(`Entry note payload missing ${key}`);
    }
  }
}

function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function formatAnnotationLabel(channel: AnnotationChannel): string {
  switch (channel) {
    case "ai":
      return "AI";
    case "system":
      return "System";
    default:
      return "Note";
  }
}
