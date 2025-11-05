import { listJournals } from "./data";
import { listGoals } from "./goals";
import { resolveOpenAIApiKey } from "./ai";

interface WeeklyReviewArgs {
  journals?: { date: string; content: string }[];
  goals?: { title: string; status: string; progress: string }[];
  schedules?: { date: string; content: string }[];
}

export interface WeeklyReviewReport {
  highlights: string[];
  goalProgress: string[];
  patterns: string[];
  suggestions: string[];
}

const MODEL_NAME = "gpt-4o-mini";

const REVIEW_SCHEMA = {
  name: "riflett_weekly_review",
  schema: {
    type: "object",
    required: ["highlights", "goalProgress", "patterns", "suggestions"],
    additionalProperties: false,
    properties: {
      highlights: { type: "array", items: { type: "string" } },
      goalProgress: { type: "array", items: { type: "string" } },
      patterns: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export async function generateWeeklyReview(): Promise<WeeklyReviewReport> {
  const [rawEntries, goals] = await Promise.all([
    listJournals({ limit: 200 }),
    listGoals({ limit: 50 }),
  ]);

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const journals = rawEntries
    .filter((entry) => entry.type === "journal")
    .filter((entry) => new Date(entry.created_at).getTime() >= cutoff)
    .map((entry) => ({
      date: entry.created_at,
      content: entry.content,
    }));

  const schedules = rawEntries
    .filter((entry) => entry.type === "schedule")
    .filter((entry) => new Date(entry.created_at).getTime() >= cutoff)
    .map((entry) => ({
      date: entry.created_at,
      content: entry.content,
    }));

  const goalSummaries = goals.map((goal) => {
    const completed = goal.micro_steps.filter((step) => step.completed).length;
    const total = goal.micro_steps.length || 1;
    const progress = Math.round((completed / total) * 100);
    return {
      title: goal.title,
      status: goal.status,
      progress: `${progress}% (${completed}/${
        goal.micro_steps.length || 0
      } milestones)`,
    };
  });

  const payload: WeeklyReviewArgs = {
    journals,
    goals: goalSummaries,
    schedules,
  };

  const apiKey = resolveOpenAIApiKey();

  const body = {
    model: MODEL_NAME,
    temperature: 0.4,
    response_format: {
      type: "json_schema",
      json_schema: REVIEW_SCHEMA,
    },
    messages: [
      {
        role: "system",
        content:
          "You are Riflett reviewing the past seven days. Identify progress, patterns, and focused suggestions. Keep each bullet concise and supportive.",
      },
      {
        role: "user",
        content: JSON.stringify(payload, null, 2),
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Weekly review request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.warn("[weeklyReview] OpenAI error", response.status, errorText);
    throw new Error("Failed to generate weekly review");
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Weekly review missing content");
  }

  const parsed = JSON.parse(content) as WeeklyReviewReport;
  return {
    highlights: parsed.highlights ?? [],
    goalProgress: parsed.goalProgress ?? [],
    patterns: parsed.patterns ?? [],
    suggestions: parsed.suggestions ?? [],
  };
}
