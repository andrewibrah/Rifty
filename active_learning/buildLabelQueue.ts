import { promises as fs } from 'fs';
import path from 'path';
import type { IntentLabelId } from '../runtime/intent-engine/types';

const OUTBOX_DIR = path.resolve(process.cwd(), 'active_learning/outbox');
const QUEUE_PATH = path.join(OUTBOX_DIR, 'intent_label_queue.json');

interface RawAudit {
  id: string;
  created_at: string;
  prompt: string;
  predicted_intent: string;
  correct_intent: string;
  entry_id: string;
  user_id: string;
  entries?: { content: string; type: string } | null;
}

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

function resolveSuggestion(audit: RawAudit): IntentLabelId | null {
  const normalized = audit.correct_intent?.toLowerCase().replace(/\s+/g, '_');
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

async function loadAudits(): Promise<RawAudit[]> {
  let files: string[] = [];
  try {
    files = await fs.readdir(OUTBOX_DIR);
  } catch {
    return [];
  }

  const auditFiles = files.filter((file) => file.startsWith('intent_audits_') && file.endsWith('.json'));
  const rows: RawAudit[] = [];

  for (const file of auditFiles) {
    const raw = await fs.readFile(path.join(OUTBOX_DIR, file), 'utf8');
    const parsed = JSON.parse(raw) as RawAudit[];
    rows.push(...parsed);
  }

  return rows;
}

async function main() {
  const audits = await loadAudits();
  if (audits.length === 0) {
    console.log('[active-learning] no audits found in outbox');
    return;
  }

  const dedup = new Map<string, RawAudit>();
  for (const audit of audits) {
    dedup.set(audit.id, audit);
  }

  const queue: LabelQueueRow[] = Array.from(dedup.values())
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((audit) => {
      const suggestion = resolveSuggestion(audit);
      const text = audit.entries?.content ?? audit.prompt;
      const status: LabelQueueRow['status'] = suggestion ? 'verified' : 'pending';
      return {
        id: audit.id,
        created_at: audit.created_at,
        entry_id: audit.entry_id,
        text,
        predicted: audit.predicted_intent,
        suggestedLabel: suggestion,
        label: suggestion,
        status,
      };
    });

  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  await fs.writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2));
  console.log('[active-learning] label queue written to', path.relative(process.cwd(), QUEUE_PATH));
  console.log('[active-learning] total items:', queue.length);
}

main().catch((error) => {
  console.error('[active-learning] build queue failed', error);
  process.exit(1);
});
