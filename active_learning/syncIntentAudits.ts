import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const STATE_DIR = path.resolve(process.cwd(), 'active_learning/state');
const OUTBOX_DIR = path.resolve(process.cwd(), 'active_learning/outbox');
const STATE_FILE = path.join(STATE_DIR, 'last_sync.json');

interface LastSyncState {
  since: string;
  lastId?: string;
}

interface IntentAuditRow {
  id: string;
  created_at: string;
  prompt: string;
  predicted_intent: string;
  correct_intent: string;
  entry_id: string;
  user_id: string;
  entries?: { content: string; type: string } | null;
}

async function loadState(): Promise<LastSyncState | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as LastSyncState;
  } catch {
    return null;
  }
}

async function saveState(state: LastSyncState): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function resolveSince(state: LastSyncState | null): string {
  if (process.env.SINCE) {
    return process.env.SINCE;
  }
  if (state?.since) {
    return state.since;
  }
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return yesterday.toISOString();
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const previousState = await loadState();
  const since = resolveSince(previousState);

  console.log('[active-learning] syncing audits since', since);

  const { data, error } = await supabase
    .from('intent_audits')
    .select('id, created_at, prompt, predicted_intent, correct_intent, entry_id, user_id, entries(content,type)')
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) {
    throw error;
  }

  const rawRows = Array.isArray(data) ? data : [];
  const rows: IntentAuditRow[] = rawRows.map((row: any) => ({
    id: String(row.id),
    created_at: String(row.created_at),
    prompt: String(row.prompt ?? ''),
    predicted_intent: String(row.predicted_intent ?? ''),
    correct_intent: String(row.correct_intent ?? ''),
    entry_id: String(row.entry_id ?? ''),
    user_id: String(row.user_id ?? ''),
    entries: Array.isArray(row.entries)
      ? (row.entries[0] ?? null)
      : row.entries ?? null,
  }));

  if (rows.length === 0) {
    console.log('[active-learning] no new audits found');
    return;
  }

  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(OUTBOX_DIR, `intent_audits_${timestamp}.json`);
  await fs.writeFile(outPath, JSON.stringify(rows, null, 2));

  const lastRow = rows[rows.length - 1]!;
  await saveState({ since: lastRow.created_at, lastId: lastRow.id });

  console.log(`[active-learning] wrote ${rows.length} rows to ${path.relative(process.cwd(), outPath)}`);
}

main().catch((error) => {
  console.error('[active-learning] sync failed', error);
  process.exit(1);
});
