/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/config.ts";
import { supabaseAdminClient } from "../_shared/client.ts";
import { generateEmbedding } from "../_shared/embedding.ts";

type MemoryNodeType = "entry" | "goal" | "topic" | "mood" | "anchor";

interface MemoryMatch {
  node_id: string;
  score: number;
  node_type: MemoryNodeType;
  text: string;
  trust_weight: number;
  sentiment: number | null;
  metadata: Record<string, unknown> | null;
}

interface MemoryNodeRow {
  id: string;
  type: MemoryNodeType;
  text: string;
  trust_weight: number;
  sentiment: number | null;
  metadata: Record<string, unknown> | null;
}

interface MemoryEdgeRow {
  id: string;
  src_id: string;
  dst_id: string;
  relation: string;
  weight: number;
  metadata: Record<string, unknown> | null;
}

interface ContextResult {
  recent_modes: Array<{
    label: string;
    count: number;
    last_seen_at: string;
  }>;
  top_topics: Array<{
    topic: string;
    weight: number;
  }>;
  last_goals: Array<{
    id: string;
    title: string;
    status: string;
    current_step: string | null;
    updated_at: string;
  }>;
  likely_need: string;
  evidence_nodes: Array<{
    id: string;
    type: MemoryNodeType;
    text: string;
    strength: number;
    trust_weight: number;
    sentiment: number | null;
    sources: string[];
  }>;
}

const VECTOR_MATCH_LIMIT = 7;
const EDGE_WEIGHT_THRESHOLD = 0.4;
const HEURISTIC_TOP_TOPIC_LIMIT = 5;

async function requireUser(accessToken: string) {
  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    console.error("[context_rebuilder] requireUser failed", error);
    throw jsonResponse(401, {
      version: "spine.v1",
      error: "Invalid or expired access token",
    });
  }
  return data.user;
}

function inferLikelyNeed(inputText: string, dominantMood: string | null, topTopic: string | null): string {
  const normalized = inputText.toLowerCase();
  if (normalized.includes("schedule") || normalized.includes("calendar")) {
    return "schedule_alignment";
  }
  if (normalized.includes("goal") || normalized.includes("progress")) {
    return "goal_support";
  }
  if (
    normalized.includes("tired") ||
    normalized.includes("fatigue") ||
    normalized.includes("exhausted") ||
    normalized.includes("burned out")
  ) {
    return "energy_check";
  }
  if (normalized.includes("again") && dominantMood === "stressed") {
    return "stress_recovery";
  }
  if (dominantMood === "tired") {
    return "restoration_prompt";
  }
  if (topTopic === "work" || topTopic === "project") {
    return "workload_review";
  }
  if (topTopic === "family" || topTopic === "relationships") {
    return "relationship_context";
  }
  return "context_refresh";
}

function aggregateModes(entries: Array<{ mood: string | null; created_at: string }>) {
  const counts = new Map<string, { count: number; lastSeen: string }>();
  for (const entry of entries) {
    const mood = entry.mood?.trim().toLowerCase();
    if (!mood) continue;
    const existing = counts.get(mood);
    if (existing) {
      existing.count += 1;
      if (existing.lastSeen < entry.created_at) {
        existing.lastSeen = entry.created_at;
      }
    } else {
      counts.set(mood, { count: 1, lastSeen: entry.created_at });
    }
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      last_seen_at: value.lastSeen,
    }))
    .sort((a, b) => b.count - a.count || b.last_seen_at.localeCompare(a.last_seen_at))
    .slice(0, 6);
}

function buildEvidence(
  matches: MemoryMatch[],
  edgeRows: MemoryEdgeRow[],
  neighborNodes: Map<string, MemoryNodeRow>,
  includeFatigue: MemoryNodeRow[]
): ContextResult["evidence_nodes"] {
  const evidence = new Map<string, {
    id: string;
    type: MemoryNodeType;
    text: string;
    strength: number;
    trust_weight: number;
    sentiment: number | null;
    sources: Set<string>;
  }>();

  const addEvidence = (node: MemoryNodeRow, strength: number, source: string) => {
    if (!node || strength < EDGE_WEIGHT_THRESHOLD) return;
    const current = evidence.get(node.id);
    if (current) {
      if (current.strength < strength) {
        current.strength = strength;
      }
      current.sources.add(source);
    } else {
      evidence.set(node.id, {
        id: node.id,
        type: node.type,
        text: node.text,
        trust_weight: node.trust_weight,
        sentiment: node.sentiment ?? null,
        strength,
        sources: new Set([source]),
      });
    }
  };

  for (const match of matches) {
    const node: MemoryNodeRow = {
      id: match.node_id,
      type: match.node_type,
      text: match.text,
      trust_weight: match.trust_weight,
      sentiment: match.sentiment ?? null,
      metadata: match.metadata,
    };
    addEvidence(node, match.score * match.trust_weight, "vector_match");
  }

  for (const edge of edgeRows) {
    const sourceNode = neighborNodes.get(edge.src_id);
    const targetNode = neighborNodes.get(edge.dst_id);
    if (!sourceNode || !targetNode) continue;

    const forwardStrength = edge.weight * targetNode.trust_weight;
    addEvidence(targetNode, forwardStrength, `edge:${edge.relation}`);

    const reverseStrength = edge.weight * sourceNode.trust_weight;
    addEvidence(sourceNode, reverseStrength, `edge:${edge.relation}`);
  }

  for (const fatigueNode of includeFatigue) {
    addEvidence(fatigueNode, Math.min(0.9, fatigueNode.trust_weight), "fatigue_recall");
  }

  return Array.from(evidence.values())
    .map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      strength: Number(item.strength.toFixed(3)),
      trust_weight: Number(item.trust_weight.toFixed(3)),
      sentiment: item.sentiment,
      sources: Array.from(item.sources).slice(0, 5),
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20);
}

async function fetchFatigueNodes(userId: string): Promise<MemoryNodeRow[]> {
  const { data, error } = await supabaseAdminClient
    .from("riflett_memory_node")
    .select("id, type, text, trust_weight, sentiment, metadata")
    .eq("user_id", userId)
    .eq("type", "mood")
    .in("text", ["tired", "fatigue", "fatigued", "stressed", "stress", "burned out"])
    .order("updated_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("[context_rebuilder] fetchFatigueNodes failed", error);
    return [];
  }

  return (data ?? []) as MemoryNodeRow[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      version: "spine.v1",
      error: "Method not allowed",
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, {
        version: "spine.v1",
        error: "Missing Authorization header",
      });
    }

    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
      return jsonResponse(401, {
        version: "spine.v1",
        error: "Invalid Authorization header",
      });
    }

    const user = await requireUser(accessToken);
    const rawBody = await req.json().catch(() => null);

    if (!rawBody || typeof rawBody !== "object") {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "Request body must be JSON",
      });
    }

    const inputTextRaw = typeof rawBody.input_text === "string" ? rawBody.input_text : rawBody.inputText;
    const inputText = typeof inputTextRaw === "string" ? inputTextRaw.trim() : "";
    if (!inputText) {
      return jsonResponse(400, {
        version: "spine.v1",
        error: "input_text is required",
      });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const includeFatigueSnapshots = inputText.length < 12 || inputText.toLowerCase().includes("again");

    const entriesPromise = supabaseAdminClient
      .from("entries")
      .select("id, created_at, type, mood")
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(40);

    const goalsPromise = supabaseAdminClient
      .from("goals")
      .select("id, title, status, current_step, updated_at")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(5);

    const [entriesResult, goalsResult] = await Promise.all([entriesPromise, goalsPromise]);

    if (entriesResult.error) {
      console.error("[context_rebuilder] entries fetch failed", entriesResult.error);
      return jsonResponse(500, { version: "spine.v1", error: "Failed to load entries" });
    }

    if (goalsResult.error) {
      console.error("[context_rebuilder] goals fetch failed", goalsResult.error);
      return jsonResponse(500, { version: "spine.v1", error: "Failed to load goals" });
    }

    const entries = (entriesResult.data ?? []) as Array<{ id: string; created_at: string; type: string; mood: string | null }>;
    const entryIds = entries.map((entry) => entry.id);

    let recentSummaries: Array<{ entry_id: string; topics: string[] | null }> = [];
    if (entryIds.length > 0) {
      const summariesResult = await supabaseAdminClient
        .from("entry_summaries")
        .select("entry_id, topics")
        .in("entry_id", entryIds)
        .eq("user_id", user.id);

      if (summariesResult.error) {
        console.warn("[context_rebuilder] entry_summaries fetch failed", summariesResult.error);
      } else {
        recentSummaries = (summariesResult.data ?? []) as Array<{ entry_id: string; topics: string[] | null }>;
      }
    }

    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(inputText);
    } catch (embeddingError) {
      console.warn("[context_rebuilder] embedding generation skipped", embeddingError);
    }

    let matches: MemoryMatch[] = [];
    if (embedding) {
      const matchResult = await supabaseAdminClient.rpc("riflett_match_memory_nodes", {
        query_embedding: embedding,
        match_user_id: user.id,
        match_count: VECTOR_MATCH_LIMIT,
        min_score: 0.25,
      });

      if (matchResult.error) {
        console.error("[context_rebuilder] riflett_match_memory_nodes failed", matchResult.error);
      } else {
        matches = (matchResult.data ?? []) as MemoryMatch[];
      }
    }

    const matchedNodeIds = matches.map((match) => match.node_id);
    let edgeRows: MemoryEdgeRow[] = [];
    let neighborLookup = new Map<string, MemoryNodeRow>();

    if (matchedNodeIds.length > 0) {
      const edgeFilters = matchedNodeIds.join(",");
      const edgesResult = await supabaseAdminClient
        .from("riflett_memory_edge")
        .select("id, src_id, dst_id, relation, weight, metadata")
        .eq("user_id", user.id)
        .or(`src_id.in.(${edgeFilters}),dst_id.in.(${edgeFilters})`)
        .limit(60);

      if (edgesResult.error) {
        console.error("[context_rebuilder] edges fetch failed", edgesResult.error);
      } else {
        edgeRows = (edgesResult.data ?? []) as MemoryEdgeRow[];
      }

      const neighborIds = new Set<string>(matchedNodeIds);
      for (const edge of edgeRows) {
        neighborIds.add(edge.src_id);
        neighborIds.add(edge.dst_id);
      }

      const nodesResult = await supabaseAdminClient
        .from("riflett_memory_node")
        .select("id, type, text, trust_weight, sentiment, metadata")
        .eq("user_id", user.id)
        .in("id", Array.from(neighborIds));

      if (nodesResult.error) {
        console.error("[context_rebuilder] neighbor nodes fetch failed", nodesResult.error);
      } else {
        neighborLookup = new Map(
          (nodesResult.data as MemoryNodeRow[] ?? []).map((node) => [node.id, node])
        );
      }
    }

    let fatigueNodes: MemoryNodeRow[] = [];
    if (includeFatigueSnapshots) {
      fatigueNodes = await fetchFatigueNodes(user.id);
    }

    const evidenceNodes = buildEvidence(matches, edgeRows, neighborLookup, fatigueNodes);

    const topicScores = new Map<string, number>();
    for (const summary of recentSummaries) {
      const topics = Array.isArray(summary.topics) ? summary.topics : [];
      for (const [index, topic] of topics.entries()) {
        const normalized = topic.trim().toLowerCase();
        if (!normalized) continue;
        const currentScore = topicScores.get(normalized) ?? 0;
        topicScores.set(normalized, currentScore + 1 / (index + 1));
      }
    }

    for (const evidence of evidenceNodes) {
      if (evidence.type === "topic") {
        const current = topicScores.get(evidence.text) ?? 0;
        topicScores.set(evidence.text, current + evidence.strength);
      }
    }

    const topTopics = Array.from(topicScores.entries())
      .map(([topic, weight]) => ({ topic, weight: Number(weight.toFixed(3)) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, HEURISTIC_TOP_TOPIC_LIMIT);

    const recentModes = aggregateModes(entries);
    const dominantMood = recentModes.length > 0 ? recentModes[0].label : null;
    const primaryTopic = topTopics.length > 0 ? topTopics[0].topic : null;
    const likelyNeed = inferLikelyNeed(inputText, dominantMood, primaryTopic);

    const goals = (goalsResult.data ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      current_step: string | null;
      updated_at: string;
    }>;

    const lastGoals = goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      current_step: goal.current_step ?? null,
      updated_at: goal.updated_at,
    }));

    const payload: ContextResult = {
      recent_modes: recentModes,
      top_topics: topTopics,
      last_goals,
      likely_need: likelyNeed,
      evidence_nodes,
    };

    const requestId = crypto.randomUUID();

    const snapshotResult = await supabaseAdminClient.from("riflett_context_snapshot").insert({
      user_id: user.id,
      input_text: inputText,
      output_json: payload,
      diagnostics: {
        request_id: requestId,
        matches_count: matches.length,
        include_fatigue: includeFatigueSnapshots,
      },
    });

    if (snapshotResult.error) {
      console.error("[context_rebuilder] snapshot insert failed", snapshotResult.error);
    }

    return jsonResponse(200, {
      version: "spine.v1",
      data: payload,
    });
  } catch (error) {
    console.error("[context_rebuilder] Unexpected error", error);
    if (error instanceof Response) {
      return error;
    }
    return jsonResponse(500, {
      version: "spine.v1",
      error: "Internal server error",
    });
  }
});
