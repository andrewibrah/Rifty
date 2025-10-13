import { promises as fs } from 'fs';
import path from 'path';
type IntentLabelId =
  | 'journal_entry'
  | 'goal_create'
  | 'goal_check_in'
  | 'schedule_create'
  | 'reminder_set'
  | 'reflection_request'
  | 'settings_change'
  | 'insight_link';

interface IntentExample {
  id: string;
  label: IntentLabelId;
  text: string;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'with',
  'about',
  'into',
  'is',
  'it',
  'be',
  'this',
  'that',
  'was',
  'were',
  'are',
  'am',
  'as',
  'but',
  'so',
  'if',
  'from',
  'by',
  'my',
  'me',
  'we',
  'our',
  'us',
  'you',
  'i',
]);

const WORD_REGEX = /[\p{Alphabetic}\p{Number}][\p{Alphabetic}\p{Number}\-']+/gu;

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = lower.match(WORD_REGEX) ?? [];
  const filtered: string[] = [];

  for (const token of tokens) {
    const normalized = token.replace(/^[^\p{Alphabetic}\p{Number}]+|[^\p{Alphabetic}\p{Number}]+$/gu, '');
    if (!normalized) continue;
    if (STOPWORDS.has(normalized)) continue;
    if (normalized.length <= 1) continue;
    filtered.push(normalized);
  }

  return filtered;
}

const BASE_DIR = path.resolve(process.cwd(), 'training/intent');
const DATA_DIR = path.join(BASE_DIR, 'data');
const SEED_FILE = path.join(DATA_DIR, 'seed_intents.json');
const HUMAN_LABELS_FILE = path.join(DATA_DIR, 'human_labels.json');
const RUNTIME_MODEL_PATH = path.resolve(process.cwd(), 'runtime/intent-engine/model.ts');
const ALPHA = 1.2;

const LABEL_DEFINITIONS: Record<IntentLabelId, { display: string; subsystem: string }> = {
  journal_entry: { display: 'Journal Entry', subsystem: 'entries' },
  goal_create: { display: 'Goal Create', subsystem: 'goals' },
  goal_check_in: { display: 'Goal Check-in', subsystem: 'goals' },
  schedule_create: { display: 'Schedule Create', subsystem: 'schedule' },
  reminder_set: { display: 'Reminder Set', subsystem: 'schedule' },
  reflection_request: { display: 'Reflection Request', subsystem: 'entries' },
  settings_change: { display: 'Settings Change', subsystem: 'user_config' },
  insight_link: { display: 'Insight Link', subsystem: 'knowledge' },
};

async function loadDataset(): Promise<IntentExample[]> {
  const [seedRaw, humanRaw] = await Promise.all([
    fs.readFile(SEED_FILE, 'utf8'),
    fs.readFile(HUMAN_LABELS_FILE, 'utf8').catch(() => '[]'),
  ]);

  const seed = JSON.parse(seedRaw) as IntentExample[];
  const human = JSON.parse(humanRaw) as IntentExample[];

  const seen = new Set<string>();
  const merged: IntentExample[] = [];

  for (const item of [...seed, ...human]) {
    if (!item?.id || !item?.text || !item?.label) continue;
    if (!(item.label in LABEL_DEFINITIONS)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push({
      id: String(item.id),
      label: item.label,
      text: String(item.text),
    });
  }

  return merged;
}

function buildModel(examples: IntentExample[]) {
  if (examples.length === 0) {
    throw new Error('No training examples found.');
  }

  const labelCounts: Record<IntentLabelId, number> = {
    journal_entry: 0,
    goal_create: 0,
    goal_check_in: 0,
    schedule_create: 0,
    reminder_set: 0,
    reflection_request: 0,
    settings_change: 0,
    insight_link: 0,
  };

  const tokenCounts: Record<IntentLabelId, Record<string, number>> = {
    journal_entry: {},
    goal_create: {},
    goal_check_in: {},
    schedule_create: {},
    reminder_set: {},
    reflection_request: {},
    settings_change: {},
    insight_link: {},
  };

  const totalTokensPerLabel: Record<IntentLabelId, number> = {
    journal_entry: 0,
    goal_create: 0,
    goal_check_in: 0,
    schedule_create: 0,
    reminder_set: 0,
    reflection_request: 0,
    settings_change: 0,
    insight_link: 0,
  };

  const vocabulary = new Map<string, number>();

  for (const example of examples) {
    labelCounts[example.label] += 1;
    const tokens = tokenize(example.text);
    for (const token of tokens) {
      vocabulary.set(token, (vocabulary.get(token) ?? 0) + 1);
      const labelTokenCounts = tokenCounts[example.label];
      labelTokenCounts[token] = (labelTokenCounts[token] ?? 0) + 1;
      totalTokensPerLabel[example.label] += 1;
    }
  }

  const totalExamples = examples.length;
  const vocabSize = vocabulary.size || 1;

  const logPriors = Object.fromEntries(
    (Object.keys(labelCounts) as IntentLabelId[]).map((label) => {
      const prior = labelCounts[label] / totalExamples;
      return [label, Math.log(prior || 1e-9)];
    })
  ) as Record<IntentLabelId, number>;

  const tokenLogLikelihoods = Object.fromEntries(
    (Object.keys(tokenCounts) as IntentLabelId[]).map((label) => {
      const counts = tokenCounts[label];
      const total = totalTokensPerLabel[label];
      const denominator = total + ALPHA * vocabSize;
      const perToken: Record<string, number> = {};

      for (const [token, count] of Object.entries(counts)) {
        perToken[token] = Math.log((count + ALPHA) / denominator);
      }

      return [label, perToken];
    })
  ) as Record<IntentLabelId, Record<string, number>>;

  const unseenTokenPenalty = Math.min(
    ...((Object.keys(totalTokensPerLabel) as IntentLabelId[]).map((label) => {
      const total = totalTokensPerLabel[label];
      const denominator = total + ALPHA * vocabSize;
      return Math.log(ALPHA / denominator);
    }))
  );

  const topFeatures = Object.fromEntries(
    (Object.keys(tokenCounts) as IntentLabelId[]).map((label) => {
      const entries = Object.entries(tokenCounts[label]);
      entries.sort((a, b) => b[1] - a[1]);
      return [label, entries.slice(0, 5).map(([token]) => token)];
    })
  );

  const labels = (Object.keys(LABEL_DEFINITIONS) as IntentLabelId[]).map((label) => ({
    id: label,
    display: LABEL_DEFINITIONS[label].display,
    subsystem: LABEL_DEFINITIONS[label].subsystem as
      | 'entries'
      | 'goals'
      | 'schedule'
      | 'user_config'
      | 'knowledge',
  }));

  const version = `intent-bayes-${new Date().toISOString().slice(0, 10)}`;

  return {
    version,
    createdAt: new Date().toISOString(),
    description: 'Naive Bayes classifier trained from Supabase audits + seed dataset.',
    labels,
    logPriors,
    tokenLogLikelihoods,
    unseenTokenPenalty,
    vocabularySize: vocabSize,
    alpha: ALPHA,
    topFeatures,
  };
}

function toTypeScriptSource(model: ReturnType<typeof buildModel>): string {
  const serialized = JSON.stringify(model, null, 2);
  return `import type { RuntimeIntentModel } from './types';

export const INTENT_MODEL: RuntimeIntentModel = ${serialized} as RuntimeIntentModel;
`;
}

async function main() {
  const dataset = await loadDataset();
  const model = buildModel(dataset);
  const source = toTypeScriptSource(model);
  await fs.writeFile(RUNTIME_MODEL_PATH, source, 'utf8');

  const summary = {
    rows: dataset.length,
    vocabulary: model.vocabularySize,
    version: model.version,
  };

  console.log('[train-intent] model written to', path.relative(process.cwd(), RUNTIME_MODEL_PATH));
  console.table(summary);
}

main().catch((error) => {
  console.error('[train-intent] failed', error);
  process.exit(1);
});
