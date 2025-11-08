/// <reference lib="deno.ns" />
/**
 * RAG Search - Vector similarity search + multi-table queries
 * Searches across entries, goals, and schedules using embeddings
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { corsHeaders, jsonResponse, requireEnv } from "../_shared/config.ts";
import { generateEmbedding } from "../_shared/embedding.ts";

const SUPABASE_URL = requireEnv("PROJECT_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const RAG_ENTRY_THRESHOLD = 0.45;
const RAG_GOAL_THRESHOLD = 0.4;
const RAG_MAX_RESULTS = 9;
const RAG_MATCH_COUNT = 18;

type RagKind = "entry" | "goal" | "schedule";

interface RagResult {
  id: string;
  kind: RagKind;
  score: number;
  title?: string;
  snippet: string;
  metadata: Record<string, unknown>;
}

interface RequestBody {
  query: string;
  scope?: RagKind | RagKind[] | "all";
  limit?: number;
}

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

function computeTokenScore(query: string, text: string): number {
  const trimmedQuery = query.trim().toLowerCase();
  const trimmedText = text.trim().toLowerCase();
  if (!trimmedQuery || !trimmedText) return 0;

  const queryTokens = trimmedQuery.split(/[^a-z0-9]+/i).filter(Boolean);
  const textTokens = trimmedText.split(/[^a-z0-9]+/i).filter(Boolean);
  if (!queryTokens.length || !textTokens.length) return 0;

  const querySet = new Set(queryTokens);
  let overlap = 0;
  for (const token of textTokens) {
    if (querySet.has(token)) {
      overlap += 1;
    }
  }
  return overlap / querySet.size;
}

function scopeToKinds(
  scope: RagKind | RagKind[] | "all" | undefined
): RagKind[] {
  if (!scope || scope === "all") {
    return ["entry", "goal", "schedule"];
  }
  if (Array.isArray(scope)) {
    return Array.from(new Set(scope)).filter(
      (kind): kind is RagKind =>
        kind === "entry" || kind === "goal" || kind === "schedule"
    );
  }
  if (scope === "entry" || scope === "goal" || scope === "schedule") {
    return [scope];
  }
  return ["entry", "goal", "schedule"];
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
    const query = body.query?.trim() ?? "";

    if (!query) {
      return jsonResponse(400, { error: "Query is required" });
    }

    const kinds = scopeToKinds(body.scope);
    const limit = Math.max(1, Math.min(body.limit ?? 8, RAG_MAX_RESULTS));

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    const results: RagResult[] = [];

    // Search entries
    if (kinds.includes("entry")) {
      const { data: entryMatches } = await supabaseClient.rpc(
        "match_entry_embeddings",
        {
          query_embedding: queryEmbedding,
          match_user_id: user.id,
          match_threshold: RAG_ENTRY_THRESHOLD,
          match_count: RAG_MATCH_COUNT,
        }
      );

      if (
        entryMatches &&
        Array.isArray(entryMatches) &&
        entryMatches.length > 0
      ) {
        const entryIds = entryMatches
          .map((m: any) => m.entry_id)
          .filter(Boolean);

        if (entryIds.length > 0) {
          const { data: entryDetails } = await supabaseClient
            .from("entries")
            .select(
              "id, type, content, metadata, created_at, entry_summaries(summary, emotion, urgency_level)"
            )
            .in("id", entryIds);

          if (entryDetails) {
            const entryMap = new Map(entryDetails.map((e: any) => [e.id, e]));

            for (const match of entryMatches) {
              const entry = entryMap.get(match.entry_id);
              if (!entry) continue;

              const summary =
                Array.isArray(entry.entry_summaries) && entry.entry_summaries[0]
                  ? entry.entry_summaries[0].summary
                  : "";
              const snippetSource =
                summary ||
                (typeof entry.content === "string" ? entry.content : "");
              const title = entry.type ? `${entry.type} entry` : "Entry";

              results.push({
                id: match.entry_id,
                kind: "entry",
                score:
                  0.7 * Number(match.similarity ?? 0) +
                  0.3 * computeTokenScore(query, snippetSource),
                title,
                snippet: snippetSource.slice(0, 220),
                metadata: {
                  created_at: entry.created_at ?? null,
                  type: entry.type ?? null,
                  emotion:
                    (Array.isArray(entry.entry_summaries) &&
                      entry.entry_summaries[0]?.emotion) ||
                    null,
                  urgency_level:
                    (Array.isArray(entry.entry_summaries) &&
                      entry.entry_summaries[0]?.urgency_level) ||
                    null,
                },
              });
            }
          }
        }
      }
    }

    // Search goals
    if (kinds.includes("goal")) {
      const { data: goalMatches } = await supabaseClient.rpc(
        "match_goal_embeddings",
        {
          query_embedding: queryEmbedding,
          match_user_id: user.id,
          match_threshold: RAG_GOAL_THRESHOLD,
          match_count: RAG_MATCH_COUNT,
        }
      );

      if (goalMatches && Array.isArray(goalMatches) && goalMatches.length > 0) {
        const goalIds = goalMatches.map((m: any) => m.goal_id).filter(Boolean);

        if (goalIds.length > 0) {
          const { data: goalDetails } = await supabaseClient
            .from("goals")
            .select(
              "id, title, status, current_step, micro_steps, metadata, updated_at, description"
            )
            .in("id", goalIds);

          if (goalDetails) {
            const goalMap = new Map(goalDetails.map((g: any) => [g.id, g]));

            for (const match of goalMatches) {
              const goal = goalMap.get(match.goal_id);
              if (!goal) continue;

              const snippetSource =
                goal.description ||
                goal.current_step ||
                (Array.isArray(goal.micro_steps)
                  ? goal.micro_steps.join(" → ")
                  : String(goal.title ?? "Goal"));

              results.push({
                id: match.goal_id,
                kind: "goal",
                score:
                  0.7 * Number(match.similarity ?? 0) +
                  0.3 * computeTokenScore(query, snippetSource),
                title: goal.title ?? match.title ?? "Goal",
                snippet: snippetSource.slice(0, 220),
                metadata: {
                  status: goal.status ?? match.status ?? null,
                  current_step: goal.current_step ?? null,
                  micro_steps: goal.micro_steps ?? [],
                  updated_at: goal.updated_at ?? null,
                },
              });
            }
          }
        }
      }
    }

    // Search schedules (token-based, no embeddings)
    if (kinds.includes("schedule")) {
      const { data: scheduleRows } = await supabaseClient
        .from("schedule_blocks")
        .select(
          "id, intent, summary, start_at, end_at, goal_id, location, attendees"
        )
        .eq("user_id", user.id)
        .order("start_at", { ascending: true })
        .limit(15);

      if (scheduleRows) {
        for (const row of scheduleRows) {
          const text = [row.summary, row.intent, row.location]
            .filter(Boolean)
            .join(" ");
          const score = computeTokenScore(query, text);

          if (score > 0) {
            const snippetSource =
              row.summary || row.intent || "Scheduled block";

            results.push({
              id: String(row.id),
              kind: "schedule",
              score,
              title: row.intent || "Schedule block",
              snippet: snippetSource,
              metadata: {
                start_at: row.start_at ?? null,
                end_at: row.end_at ?? null,
                location: row.location ?? null,
                attendees: Array.isArray(row.attendees) ? row.attendees : [],
                goal_id: row.goal_id ?? null,
              },
            });
          }
        }
      }
    }

    // Sort and deduplicate
    const sorted = results.sort((a, b) => b.score - a.score);
    const maxPerKind = Math.max(
      1,
      Math.ceil(limit / Math.max(1, kinds.length))
    );
    const counts = new Map<RagKind, number>();
    const deduped: RagResult[] = [];
    const seen = new Set<string>();

    for (const item of sorted) {
      if (seen.has(item.id)) continue;

      const currentCount = counts.get(item.kind) ?? 0;
      if (currentCount >= maxPerKind) continue;

      deduped.push(item);
      seen.add(item.id);
      counts.set(item.kind, currentCount + 1);

      if (deduped.length >= limit) break;
    }

    return jsonResponse(200, {
      results: deduped.slice(0, limit),
      total: deduped.length,
      query,
    });
  } catch (error: any) {
    console.error("[rag_search] Error:", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error?.message || "Unknown error",
    });
  }
});
