import type { PlannerResponse } from "@/agent/types";
import type { IntentPayload } from "@/chat/handleMessage";
import { resolveOpenAIApiKey } from "./ai";
import { supabase } from "../lib/supabase";
import { Memory } from "@/agent/memory";
import { listActiveGoalsWithContext } from "./goals.unified";
import { suggestBlocks } from "./schedules";
import type { GoalContextItem } from "../types/goal";
import type { OperatingPicture, RagResult } from "./memory";

type MainChatAiResponse = {
  reply: string;
  learned: string;
  ethical: string;
  receiptsFooter: string[];
  confidence: SynthesisResult["confidence"];
  synthesis: SynthesisResult;
};

export interface MainChatBrief {
  operatingPicture: OperatingPicture;
  goalContext: GoalContextItem[];
  retrieval: RagResult[];
  scheduleSuggestions: Array<{
    start: string;
    end: string;
    intent: string;
    goal_id: string | null;
    receipts: Record<string, unknown>;
  }>;
}

interface LeverSynopsis {
  label: string;
  evidence: string;
  receipt: string | null;
}

interface ActionSynopsis {
  title: string;
  detail: string;
  receipts: Record<string, string>;
}

export interface SynthesisResult {
  diagnosis: string;
  levers: LeverSynopsis[];
  action: ActionSynopsis;
  confidence: {
    retrieval: number;
    plan: number;
    overall: number;
  };
}

const MODEL_NAME = "gpt-4o-mini" as const;

const MAINCHAT_SYSTEM_PROMPT = `You are the Main Chat of Riflett. Purpose: reduce fragmentation, increase inner coherence.
Inputs: Persona Settings {tone, bluntness, spiritual_on, autonomy, privacy_gates, crisis_rules};
Why-Model {primary_aim, season, constraints, non_negotiables};
Context Brief {top_goals, relevant_entries, next_72h, cadence_profile, risk_flags}.
Rules:
- Lead with 1-sentence diagnosis, then 2–3 levers, then one reversible action.
- Cite quiet receipts (goal/entry ids or dates). Respect privacy gates.
- Match tone/bluntness; spiritual_on allows one short spiritual lens when relevant.
- Prefer clarity over comfort. Use verbs. Keep it short and surgical.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "learned", "ethical"],
  properties: {
    reply: {
      type: "string",
      description:
        "Constructive, empathetic response for the user. Reference context where relevant and keep it concise.",
    },
    learned: {
      type: "string",
      description:
        "Short bullet-style summary of new insights about the user gained from this exchange.",
    },
    ethical: {
      type: "string",
      description:
        "Plain-English description of the reflective process or safety checks performed.",
    },
  },
} as const;

const JSON_SCHEMA_WRAPPER = {
  name: "riflett_main_reply",
  schema: RESPONSE_SCHEMA,
} as const;

const resolveUserId = async (): Promise<string | null> => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.warn("[mainChat] resolveUserId failed", error);
  }
  return user?.id ?? null;
};

const safeSlice = (
  value: string | null | undefined,
  length: number
): string => {
  if (!value) return "";
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
};

export async function buildBrief(
  uid: string | null,
  intent: IntentPayload,
  cachedOperatingPicture?: import("../types/memory").OperatingPicture | null
): Promise<MainChatBrief> {
  const userId = uid ?? (await resolveUserId());
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const query = intent.text ?? intent.enriched?.userText ?? "";
  const briefSnapshot = await Memory.getBrief(
    userId,
    intent.routedIntent,
    query,
    {
      cachedOperatingPicture,
    }
  );

  let goalContext: GoalContextItem[] =
    (intent.enriched.goalContext as GoalContextItem[] | undefined) ?? [];
  if (!goalContext.length) {
    try {
      goalContext = await listActiveGoalsWithContext(userId, 5);
    } catch (goalError) {
      console.warn("[mainChat] goal context fallback failed", goalError);
      goalContext = [];
    }
  }

  let scheduleSuggestions: MainChatBrief["scheduleSuggestions"] = [];
  try {
    const rawSuggestions = await suggestBlocks(
      userId,
      goalContext[0]?.id ?? null
    );
    scheduleSuggestions = rawSuggestions.map((suggestion) => ({
      start: suggestion.start,
      end: suggestion.end,
      intent: suggestion.intent,
      goal_id: suggestion.goal_id,
      receipts: suggestion.receipts,
    }));
  } catch (suggestError) {
    console.warn("[mainChat] suggestBlocks failed", suggestError);
  }

  return {
    operatingPicture: briefSnapshot.operatingPicture,
    goalContext,
    retrieval: briefSnapshot.rag,
    scheduleSuggestions,
  };
}

const formatLever = (
  label: string,
  evidence: string,
  receipt: string | null
): LeverSynopsis => ({
  label,
  evidence,
  receipt,
});

const formatActionSynopsis = (
  title: string,
  detail: string,
  receipts: Record<string, string>
): ActionSynopsis => ({
  title,
  detail,
  receipts,
});

const average = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export function synthesize(
  planPolicy: PlannerResponse | null,
  brief: MainChatBrief
): SynthesisResult {
  const topGoal = brief.goalContext[0] ?? null;
  const riskFlag = brief.operatingPicture.risk_flags?.[0] ?? null;
  const hotEntry = brief.operatingPicture.hot_entries?.[0] ?? null;

  const diagnosisParts: string[] = [];
  if (riskFlag) {
    diagnosisParts.push(`Risk: ${riskFlag}`);
  }
  if (topGoal) {
    diagnosisParts.push(`Focus on ${safeSlice(topGoal.title, 48)}`);
  }
  if (!diagnosisParts.length && hotEntry) {
    diagnosisParts.push(
      `Mind the recent entry on ${hotEntry.created_at.slice(0, 10)}`
    );
  }
  if (!diagnosisParts.length) {
    diagnosisParts.push("Steady state; reinforce primary aim");
  }
  const diagnosis = diagnosisParts.join(" · ");

  const levers: LeverSynopsis[] = [];
  if (topGoal) {
    const firstPending = topGoal.micro_steps.find((step) => !step.completed);
    const receipt = topGoal.id ? `goal:${topGoal.id}` : null;
    const evidence = firstPending
      ? `Next micro-step: ${safeSlice(firstPending.description, 80)}`
      : `Status: ${topGoal.status}`;
    levers.push(formatLever(topGoal.title, evidence, receipt));
  }
  if (hotEntry) {
    const receipt = hotEntry.id ? `entry:${hotEntry.id}` : null;
    const evidence = safeSlice(hotEntry.summary || hotEntry.snippet, 90);
    levers.push(
      formatLever(
        `Reflect on ${hotEntry.created_at.slice(0, 10)}`,
        evidence,
        receipt
      )
    );
  }
  if (brief.scheduleSuggestions.length > 0) {
    const suggestion = brief.scheduleSuggestions[0]!;
    const receipt = suggestion.goal_id ? `goal:${suggestion.goal_id}` : null;
    const evidence = `Block ${new Date(suggestion.start).toLocaleString()} → ${new Date(suggestion.end).toLocaleTimeString()}`;
    levers.push(formatLever("Protect focus time", evidence, receipt));
  }
  if (brief.operatingPicture.cadence_profile) {
    const cadence = brief.operatingPicture.cadence_profile.cadence;
    const receipt = `profile:${brief.operatingPicture.cadence_profile.timezone}`;
    levers.push(
      formatLever(
        "Cadence tune",
        `Cadence set to ${cadence}; streak ${brief.operatingPicture.cadence_profile.current_streak}`,
        receipt
      )
    );
  }

  const boundedLevers = levers.slice(0, 3);

  let action: ActionSynopsis;
  if (planPolicy?.action === "schedule.create") {
    const start =
      typeof planPolicy.payload.start === "string"
        ? planPolicy.payload.start
        : (planPolicy.payload as Record<string, string | undefined>).start_at;
    const end =
      typeof planPolicy.payload.end === "string"
        ? planPolicy.payload.end
        : (planPolicy.payload as Record<string, string | undefined>).end_at;
    const goalId =
      typeof planPolicy.payload.goal_id === "string"
        ? planPolicy.payload.goal_id
        : null;
    const startLabel = start
      ? new Date(start).toLocaleString()
      : "scheduled block";
    const endLabel = end ? new Date(end).toLocaleTimeString() : "";
    const detail = endLabel ? `${startLabel} – ${endLabel}` : startLabel;
    action = formatActionSynopsis("Book focus block", detail, {
      start_at: start ?? "",
      end_at: end ?? "",
      ...(goalId ? { goal_id: goalId } : {}),
    });
  } else if (planPolicy?.action === "goal.create" && topGoal) {
    action = formatActionSynopsis(
      "Draft micro-step",
      safeSlice(
        topGoal.current_step ??
          topGoal.micro_steps[0]?.description ??
          "Define first step",
        120
      ),
      {
        goal_id: topGoal.id,
      }
    );
  } else if (brief.scheduleSuggestions.length > 0) {
    const suggestion = brief.scheduleSuggestions[0]!;
    action = formatActionSynopsis(
      "Try 30m block",
      `${new Date(suggestion.start).toLocaleString()} → ${new Date(suggestion.end).toLocaleTimeString()}`,
      {
        start_at: suggestion.start,
        end_at: suggestion.end,
        ...(suggestion.goal_id ? { goal_id: suggestion.goal_id } : {}),
      }
    );
  } else if (topGoal) {
    const micro = topGoal.micro_steps.find((step) => !step.completed);
    action = formatActionSynopsis(
      "Advance goal",
      safeSlice(micro?.description ?? "Clarify next step", 120),
      {
        goal_id: topGoal.id,
      }
    );
  } else {
    action = formatActionSynopsis(
      "Log reflection",
      "Capture one concrete win",
      {}
    );
  }

  const retrievalConfidence = Math.min(1, 0.5 + brief.retrieval.length * 0.1);
  const planConfidence = planPolicy ? 0.7 : 0.45;
  const overallConfidence = average([retrievalConfidence, planConfidence]);

  return {
    diagnosis,
    levers: boundedLevers,
    action,
    confidence: {
      retrieval: Number(retrievalConfidence.toFixed(2)),
      plan: Number(planConfidence.toFixed(2)),
      overall: Number(overallConfidence.toFixed(2)),
    },
  };
}
const STREAM_SYSTEM_PROMPT =
  "You are Riflett. Stream only the user-facing reply, keeping diagnosis → levers → reversible action order.";

export const buildReceiptsFooter = (synthesis: SynthesisResult): string[] => {
  const receipts = new Set<string>();

  synthesis.levers.forEach((lever) => {
    if (lever.receipt) {
      receipts.add(`${lever.receipt} · ${lever.label}`);
    }
  });

  Object.entries(synthesis.action.receipts ?? {}).forEach(([key, value]) => {
    if (value) {
      receipts.add(`${key}:${value}`);
    }
  });

  return Array.from(receipts);
};

function validateResponse(payload: any): asserts payload is MainChatAiResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("AI response missing payload");
  }
  (["reply", "learned", "ethical"] as const).forEach((key) => {
    if (typeof payload[key] !== "string" || !payload[key].trim()) {
      throw new Error(`AI response missing required string field: ${key}`);
    }
  });
}

const formatMatches = (matches: IntentPayload["memoryMatches"]): string => {
  if (!Array.isArray(matches) || matches.length === 0) {
    return "No prior memories matched.";
  }

  return matches
    .slice(0, 5)
    .map((match, index) => {
      const when = match.ts ? new Date(match.ts).toISOString() : "unknown";
      return `[${index + 1}] ${when} (${match.kind}): ${match.text}`;
    })
    .join("\n");
};

const formatPersonalization = (
  config: Record<string, unknown> | null | undefined
): string => {
  const persona =
    (typeof config?.persona === "string" && config.persona.length > 0
      ? (config.persona as string)
      : "Generalist") ?? "Generalist";
  const tone =
    (typeof config?.tone === "string" && config.tone.length > 0
      ? (config.tone as string)
      : "neutral") ?? "neutral";
  const bluntness =
    typeof config?.bluntness === "number" && Number.isFinite(config.bluntness)
      ? String(config.bluntness)
      : "5";
  const spiritual = config?.spiritual_on === true ? "on" : "off";

  let privacyLines = "No explicit privacy gates.";
  if (
    config &&
    typeof config.privacy_gates === "object" &&
    config.privacy_gates
  ) {
    const entries = Object.entries(
      config.privacy_gates as Record<string, unknown>
    );
    if (entries.length > 0) {
      privacyLines = entries
        .map(([key, value]) => {
          const allowed = value !== false;
          return `- ${key}: ${allowed ? "allow" : "restrict"}`;
        })
        .join("\n");
    }
  }

  return `Persona: ${persona}\nTone: ${tone}\nBluntness: ${bluntness}\nSpiritual Lens: ${spiritual}\nPrivacy Gates:\n${privacyLines}`;
};

const buildUserPrompt = (args: {
  userText: string;
  intent: IntentPayload;
  planner?: PlannerResponse | null;
  brief: MainChatBrief;
  synthesis: SynthesisResult;
}): string => {
  const { userText, intent, planner } = args;
  const { brief, synthesis } = args;

  const routedIntent = intent.routedIntent;
  const contextBlock = intent.enriched.contextSnippets.join("\n---\n");
  const memoryBlock = formatMatches(intent.memoryMatches);
  const userConfig = JSON.stringify(intent.enriched.userConfig ?? {}, null, 2);
  const personalizationBlock = formatPersonalization(
    intent.enriched.userConfig
  );

  const briefGoals = brief.goalContext
    .slice(0, 3)
    .map((goal, index) => {
      const nextStep = goal.micro_steps.find((step) => !step.completed);
      const conflicts = goal.conflicts.length
        ? `Conflicts: ${goal.conflicts.join(", ")}`
        : "No conflicts logged";
      return `(${index + 1}) ${goal.title} [${goal.status}] priority=${goal.priority_score.toFixed(2)}
 - Current step: ${nextStep ? nextStep.description : goal.current_step || "n/a"}
 - Progress: ${(goal.progress.ratio * 100).toFixed(0)}%
 - Linked: ${goal.linked_entries.map((entry) => entry.id).join(", ") || "none"}
 - ${conflicts}`;
    })
    .join("\n");

  const briefEntries = brief.operatingPicture.hot_entries
    .slice(0, 3)
    .map(
      (entry, index) =>
        `(${index + 1}) ${entry.created_at.slice(0, 10)} ${entry.type}: ${safeSlice(entry.summary, 120)}`
    )
    .join("\n");

  const upcoming = brief.operatingPicture.next_72h
    .slice(0, 3)
    .map(
      (block, index) =>
        `(${index + 1}) ${block.start_at} ${safeSlice(block.intent ?? block.summary ?? "", 80)}`
    )
    .join("\n");

  const suggestionLines =
    brief.scheduleSuggestions
      .map(
        (suggestion, index) =>
          `(${index + 1}) ${suggestion.start} → ${suggestion.end} intent=${suggestion.intent}`
      )
      .join("\n") || "No suggestions";

  const leverLines = synthesis.levers
    .map(
      (lever, index) =>
        `(${index + 1}) ${lever.label}: ${lever.evidence}${lever.receipt ? ` [${lever.receipt}]` : ""}`
    )
    .join("\n");

  const actionLine = `${synthesis.action.title}: ${synthesis.action.detail} Receipts=${JSON.stringify(synthesis.action.receipts)}`;

  const confidenceLines = `retrieval=${synthesis.confidence.retrieval.toFixed(2)}, plan=${synthesis.confidence.plan.toFixed(2)}, overall=${synthesis.confidence.overall.toFixed(2)}`;

  const plannerSummary = planner
    ? `\n[PLAN]\nAction: ${planner.action}\nPayload: ${JSON.stringify(
        planner.payload ?? {},
        null,
        2
      )}\nClarify: ${planner.ask ?? "null"}`
    : "\n[PLAN]\nAction: none (fallback to coaching response)";

  const decisionSummary =
    intent.decision.kind === "commit"
      ? `Commit to ${intent.decision.primary}`
      : intent.decision.kind === "clarify"
        ? `Clarify: ${intent.decision.question}`
        : "Fallback mode";

  return `You are Riflett, the user's reflective coach.

[USER MESSAGE]
${userText}

[INTENT]
${routedIntent.label} (${(routedIntent.confidence * 100).toFixed(1)}%)
Decision: ${decisionSummary}
Slots: ${JSON.stringify(routedIntent.slots ?? {}, null, 2)}

[CONTEXT SNIPPETS]
${contextBlock || "No contextual snippets."}

[MEMORY MATCHES]
${memoryBlock}

[SITUATIONAL BRIEF]
Goals:\n${briefGoals || "No active goals."}
Hot entries:\n${briefEntries || "No urgent entries."}
Next 72h:\n${upcoming || "No scheduled blocks."}
Risk flags: ${brief.operatingPicture.risk_flags.join(", ") || "none"}
Cadence: ${brief.operatingPicture.cadence_profile.cadence} (streak ${brief.operatingPicture.cadence_profile.current_streak})
Suggestions:\n${suggestionLines}

[SYNTHESIS]
Diagnosis: ${synthesis.diagnosis}
Levers:\n${leverLines || "n/a"}
Reversible action: ${actionLine}
Confidence: ${confidenceLines}

[PERSONALIZATION]
${personalizationBlock}

[USER CONFIG]
${userConfig}
${plannerSummary}
`;
};

type GenerateArgs = {
  userText: string;
  intent: IntentPayload;
  planner?: PlannerResponse | null;
  brief?: MainChatBrief;
  synthesis?: SynthesisResult;
  apiKey?: string;
  onToken?: (chunk: string) => void;
  cachedOperatingPicture?: import("../types/memory").OperatingPicture | null;
};

type PreparedGenerateArgs = Omit<GenerateArgs, "brief" | "synthesis"> & {
  brief: MainChatBrief;
  synthesis: SynthesisResult;
};

export async function generateMainChatReply(
  args: GenerateArgs
): Promise<MainChatAiResponse> {
  const planner = args.planner ?? null;
  const brief =
    args.brief ??
    (await buildBrief(null, args.intent, args.cachedOperatingPicture));
  const synthesis = args.synthesis ?? synthesize(planner, brief);
  const requestArgs: PreparedGenerateArgs = {
    ...args,
    planner,
    brief,
    synthesis,
  };

  if (args.onToken) {
    try {
      const streamedReply = await streamReply(requestArgs, args.onToken);
      const structured = await requestStructuredResponse({
        ...requestArgs,
        existingReply: streamedReply,
      });
      return {
        ...structured,
        reply: streamedReply,
      };
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message)
          : "";
      if (message === "Streaming response unavailable") {
        console.debug("[mainChat] streaming unavailable, using fallback");
      } else {
        console.warn(
          "[mainChat] streaming failed, falling back to non-streaming",
          error
        );
      }
      const structured = await requestStructuredResponse(requestArgs);
      args.onToken(structured.reply);
      return structured;
    }
  }

  return requestStructuredResponse(requestArgs);
}

async function requestStructuredResponse(
  args: PreparedGenerateArgs & { existingReply?: string }
): Promise<MainChatAiResponse> {
  if (!args.brief || !args.synthesis) {
    throw new Error("Main chat brief unavailable");
  }

  const promptPayload = {
    userText: args.userText,
    intent: args.intent,
    planner: args.planner ?? null,
    brief: args.brief,
    synthesis: args.synthesis,
  };

  const apiKey = resolveOpenAIApiKey(args.apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const hasOverride = typeof args.existingReply === "string";

  const systemPrompt = hasOverride
    ? "You are Riflett’s analyst. Using the conversation context and the provided assistant reply, produce JSON containing the final reply (repeat it exactly), learned insights, and ethical notes."
    : MAINCHAT_SYSTEM_PROMPT;

  const userPrompt = hasOverride
    ? `${buildUserPrompt(promptPayload)}

[ASSISTANT REPLY]
${args.existingReply}

Return JSON with fields "reply" (exactly the provided reply), "learned", and "ethical".`
    : `${buildUserPrompt(promptPayload)}

Return JSON with fields "reply", "learned", and "ethical".`;

  const body = {
    model: MODEL_NAME,
    temperature: hasOverride ? 0.2 : 0.6,
    response_format: {
      type: "json_schema",
      json_schema: JSON_SCHEMA_WRAPPER,
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const message =
        response.status === 401
          ? "AI request unauthorized. Check API key."
          : `AI request failed (${response.status}).`;
      console.warn(
        "[mainChat] structured response error",
        response.status,
        errorText
      );
      throw new Error(message);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("AI response missing content");
    }

    const parsed = JSON.parse(content) as {
      reply: string;
      learned: string;
      ethical: string;
    };
    validateResponse(parsed);

    const baseReply =
      hasOverride && args.existingReply ? args.existingReply : parsed.reply;
    return {
      reply: baseReply,
      learned: parsed.learned,
      ethical: parsed.ethical,
      receiptsFooter: buildReceiptsFooter(args.synthesis),
      confidence: args.synthesis.confidence,
      synthesis: args.synthesis,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("AI request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function streamReply(
  args: PreparedGenerateArgs,
  onToken: (chunk: string) => void
): Promise<string> {
  if (!args.brief || !args.synthesis) {
    throw new Error("Main chat brief unavailable");
  }

  const promptPayload = {
    userText: args.userText,
    intent: args.intent,
    planner: args.planner ?? null,
    brief: args.brief,
    synthesis: args.synthesis,
  };

  const apiKey = resolveOpenAIApiKey(args.apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const body = {
    model: MODEL_NAME,
    temperature: 0.6,
    stream: true,
    messages: [
      { role: "system", content: STREAM_SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(promptPayload) },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const message =
      response.status === 401
        ? "AI request unauthorized. Check API key."
        : `AI request failed (${response.status}).`;
    console.warn("[mainChat] streaming error", response.status, errorText);
    throw new Error(message);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response unavailable");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let reply = "";
  let doneStreaming = false;

  try {
    while (!doneStreaming) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (!payload) {
            newlineIndex = buffer.indexOf("\n");
            continue;
          }
          if (payload === "[DONE]") {
            doneStreaming = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              reply += delta;
              onToken(delta);
            }
          } catch (error) {
            // Ignore malformed JSON chunks
          }
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      throw new Error("AI request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }

  return reply.trim();
}
