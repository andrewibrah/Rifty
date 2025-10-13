import { promises as fs } from 'fs';
import path from 'path';
import type { IntentLabelId } from '../runtime/intent-engine/types';

const QUEUE_PATH = path.resolve(process.cwd(), 'active_learning/outbox/intent_label_queue.json');
const MERGED_PATH = path.resolve(process.cwd(), 'active_learning/outbox/merged_labels.json');
const TRAINING_FILE = path.resolve(process.cwd(), 'training/intent/data/human_labels.json');

interface LabelQueueRow {
  id: string;
  created_at: string;
  entry_id: string;
  text: string;
  predicted: string;
  suggestedLabel?: IntentLabelId | null;
  label?: IntentLabelId | null;
  status: 'pending' | 'verified' | 'needs_context';
  notes?: string;
}

interface TrainingRow {
  id: string;
  label: IntentLabelId;
  text: string;
  source: string;
  metadata?: Record<string, unknown>;
}

async function loadQueue(): Promise<LabelQueueRow[]> {
  const raw = await fs.readFile(QUEUE_PATH, 'utf8');
  return JSON.parse(raw) as LabelQueueRow[];
}

async function loadTraining(): Promise<TrainingRow[]> {
  try {
    const raw = await fs.readFile(TRAINING_FILE, 'utf8');
    return JSON.parse(raw) as TrainingRow[];
  } catch {
    return [];
  }
}

function sanitizeLabel(label: unknown): IntentLabelId | null {
  if (!label || typeof label !== 'string') return null;
  const normalized = label.toLowerCase().replace(/\s+/g, '_');
  const allowed: IntentLabelId[] = [
    'journal_entry',
    'goal_create',
    'goal_check_in',
    'schedule_create',
    'reminder_set',
    'reflection_request',
    'settings_change',
    'insight_link',
  ];
  return (allowed as string[]).includes(normalized) ? (normalized as IntentLabelId) : null;
}

async function main() {
  const queue = await loadQueue();
  const training = await loadTraining();
  const existingIds = new Set(training.map((row) => row.id));

  const additions: TrainingRow[] = [];

  for (const row of queue) {
    const label = sanitizeLabel(row.label ?? row.suggestedLabel ?? null);
    if (!label) continue;
    if (row.status === 'needs_context') continue;

    const id = `al-${row.id}`;
    if (existingIds.has(id)) continue;

    additions.push({
      id,
      label,
      text: row.text,
      source: 'intent_audit',
      metadata: {
        predicted: row.predicted,
        created_at: row.created_at,
        entry_id: row.entry_id,
      },
    });
    existingIds.add(id);
  }

  if (additions.length === 0) {
    console.log('[active-learning] no new labels to merge');
    return;
  }

  const updated = [...training, ...additions];
  await fs.writeFile(TRAINING_FILE, JSON.stringify(updated, null, 2));
  await fs.writeFile(MERGED_PATH, JSON.stringify(additions, null, 2));

  console.log(`[active-learning] merged ${additions.length} labels into training dataset`);
  console.log('[active-learning] training file length:', updated.length);
}

main().catch((error) => {
  console.error('[active-learning] merge failed', error);
  process.exit(1);
});
