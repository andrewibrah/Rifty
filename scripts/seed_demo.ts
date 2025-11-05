import { createClient } from "@supabase/supabase-js";

const PROJECT_URL =
  process.env.PROJECT_URL ??
  process.env.SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "";
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

if (!PROJECT_URL) {
  throw new Error("Missing PROJECT_URL or SUPABASE_URL environment variable");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable"
  );
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DEMO_EMAIL = "demo@riflett.test";
const SEED_ID = "spine-demo";
const DEMO_PASSWORD =
  process.env.DEMO_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? "";

if (!DEMO_PASSWORD) {
  throw new Error("Missing DEMO_PASSWORD or SEED_DEMO_PASSWORD environment variable");
}

async function ensureDemoUser() {
  const { data: existing, error: fetchError } =
    await supabase.auth.admin.getUserByEmail(DEMO_EMAIL);

  if (fetchError && fetchError.name !== "AuthApiError") {
    throw fetchError;
  }

  if (existing?.user) {
    return existing.user;
  }

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      email_confirm: true,
      password: DEMO_PASSWORD,
      user_metadata: {
        seed_id: SEED_ID,
      },
    });

  if (createError || !created?.user) {
    throw createError ?? new Error("Failed to create demo user");
  }

  return created.user;
}

function buildEntries() {
  const topics = [
    {
      name: "recovery",
      mood: "tired",
      samples: [
        "Woke up exhausted despite eight hours of sleep, probably from the late-night screen time.",
        "Skipped the gym to prioritize a long stretch session; felt my shoulders finally loosen.",
        "Tried the magnesium drink again—sleep quality improved slightly, but energy still drags.",
        "Blocked off tomorrow morning for recovery and no meetings before 10am.",
        "Thinking about reintroducing a 20-minute afternoon nap to reset focus.",
        "Noticed more patience with teammates when fully rested—need to protect sleep window.",
        "Walked in the park during lunch; the fresh air noticeably helped with mood.",
      ],
    },
    {
      name: "career",
      mood: "focused",
      samples: [
        "Closed the onboarding flow audit with fewer issues than expected.",
        "Coached Dani on stepping up for the Q2 planning session; she responded well.",
        "Roadmap felt tight today—need a better signal on blocked tasks.",
        "Booking Friday afternoons as deep work time to stay ahead of partner asks.",
        "Investor update draft came together faster after reviewing last quarter's wins.",
        "Feeling momentum on the personalization initiative; should capture the wins.",
        "Want to define a clearer success metric for the autonomy plan before next review.",
      ],
    },
    {
      name: "relationships",
      mood: "grateful",
      samples: [
        "Family dinner went smoothly; practicing active listening is paying off.",
        "Helped Sam talk through the big move decision—felt good to show up present.",
        "Reconnected with college friend over coffee; reminded me of old creative sparks.",
        "Set a reminder to plan the weekend getaway we keep mentioning.",
        "Shared a gratitude list with Alex before bed; warmed the whole evening.",
        "Bought fresh flowers for the living room—small gesture, big mood lift.",
      ],
    },
  ];

  const entries = [];

  for (const topic of topics) {
    for (const sample of topic.samples) {
      entries.push({
        type: "journal",
        content: sample,
        metadata: {
          seed_id: SEED_ID,
          topic: topic.name,
        },
        mood: topic.mood,
      });
    }
  }

  return entries.slice(0, 20);
}

async function run() {
  const user = await ensureDemoUser();
  console.log(`Using user ${user.id} (${DEMO_EMAIL})`);

  const { error: deleteError } = await supabase
    .from("entries")
    .delete()
    .eq("user_id", user.id)
    .eq("metadata->>seed_id", SEED_ID);

  if (deleteError) {
    throw deleteError;
  }

  const entries = buildEntries();
  const entriesPayload = entries.map((entry) => ({
    ...entry,
    user_id: user.id,
  }));

  const { data: insertedEntries, error: insertError } = await supabase
    .from("entries")
    .insert(entriesPayload)
    .select("id, metadata, mood, content")
    .limit(entriesPayload.length);

  if (insertError) {
    throw insertError;
  }

  console.log(`Inserted ${insertedEntries?.length ?? 0} entries`);

  for (const entry of insertedEntries ?? []) {
    const topics = [entry.metadata?.topic ?? "general"];
    const summaryText = `Captured reflection on ${topics.join(", ")}.`;

    await supabase
      .from("entry_summaries")
      .insert({
        entry_id: entry.id,
        user_id: user.id,
        summary: summaryText,
        emotion: entry.mood ?? null,
        topics,
      })
      .select("id")
      .single()
      .catch((error) => {
        console.warn("[seed_demo] entry_summaries insert skipped", error);
      });

    await supabase
      .rpc("memory_graph_upsert", {
        p_entry_id: entry.id,
      })
      .catch((error) => {
        console.warn("[seed_demo] memory_graph_upsert failed for entry", entry.id, error);
      });
  }

  console.log("Seed data ready.");
}

run()
  .then(() => {
    console.log("seed_demo finished");
    if (typeof Deno !== "undefined") {
      Deno.exit(0);
    } else if (typeof process !== "undefined") {
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error("seed_demo failed", error);
    if (typeof Deno !== "undefined") {
      Deno.exit(1);
    } else if (typeof process !== "undefined") {
      process.exit(1);
    }
  });
