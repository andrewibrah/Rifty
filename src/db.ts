// src/db.ts
import * as SQLite from 'expo-sqlite';

export type EntryType = 'journal' | 'goal' | 'schedule';
export type Entry = { id?: number; type: EntryType; content: string; created_at?: string };

export type AnnotationChannel = 'note' | 'ai' | 'system';
export type Annotation = {
  id?: number;
  entry_id: number;
  kind: 'user' | 'bot' | 'system';
  channel: AnnotationChannel;
  content: string;
  created_at?: string;
};

// Open database using the new Expo SQLite sync API
const db = SQLite.openDatabaseSync('reflectify.db');

export async function initDB(): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('journal','goal','schedule')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('user','bot','system')),
      channel TEXT NOT NULL CHECK (channel IN ('note','ai','system')) DEFAULT 'note',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_entry_created
      ON annotations (entry_id, created_at);
    CREATE TABLE IF NOT EXISTS ai_learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      insight TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ai_ethics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Backfill for legacy installs that may not have 'channel' on annotations
  await db.execAsync(`ALTER TABLE annotations ADD COLUMN channel TEXT DEFAULT 'note'`).catch(() => {
    // Ignore if the column already exists
  });

  // no-op
}

export async function insertEntry(e: { type: EntryType; content: string }): Promise<void> {
  await db.runAsync(
    `INSERT INTO entries (type, content) VALUES (?, ?)`,
    [e.type, e.content]
  );
}

export async function listEntries(): Promise<Entry[]> {
  return db.getAllAsync(
    `SELECT id, type, content, created_at
     FROM entries
     ORDER BY datetime(created_at) ASC`
  ) as Promise<Entry[]>;
}

export async function listEntriesByType(type: EntryType): Promise<Entry[]> {
  return db.getAllAsync(
    `SELECT id, type, content, created_at
     FROM entries
     WHERE type = ?
     ORDER BY datetime(created_at) DESC`,
    [type]
  ) as Promise<Entry[]>;
}

export async function getEntryById(id: number): Promise<Entry | null> {
  const rows = (await db.getAllAsync(
    `SELECT id, type, content, created_at
     FROM entries
     WHERE id = ?
     LIMIT 1`,
    [id]
  )) as Entry[];
  return rows[0] ?? null;
}

export async function insertAnnotation(payload: {
  entry_id: number;
  kind: Annotation['kind'];
  channel?: AnnotationChannel;
  content: string;
  created_at?: string;
}): Promise<Annotation> {
  const createdAt = payload.created_at ?? new Date().toISOString();
  const channel = payload.channel ?? 'note';

  const result = await db.runAsync(
    `INSERT INTO annotations (entry_id, kind, channel, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.entry_id, payload.kind, channel, payload.content, createdAt]
  );

  const insertedRows = (await db.getAllAsync(
    `SELECT id, entry_id, kind, channel, content, created_at
     FROM annotations
     WHERE id = ?
     LIMIT 1`,
    [result.lastInsertRowId]
  )) as Annotation[];

  const inserted = insertedRows[0];
  if (!inserted) throw new Error('Unable to load inserted annotation');
  return inserted;
}

export async function listAnnotationsForEntry(entry_id: number): Promise<Annotation[]> {
  return db.getAllAsync(
    `SELECT id, entry_id, kind, channel, content, created_at
     FROM annotations
     WHERE entry_id = ?
     ORDER BY datetime(created_at) ASC`,
    [entry_id]
  ) as Promise<Annotation[]>;
}

export async function insertLearning(params: { entry_id: number; insight: string; created_at?: string }): Promise<void> {
  const createdAt = params.created_at ?? new Date().toISOString();
  await db.runAsync(
    `INSERT INTO ai_learnings (entry_id, insight, created_at) VALUES (?, ?, ?)`,
    [params.entry_id, params.insight, createdAt]
  );
}

export async function insertEthicalRecord(params: { entry_id: number; details: string; created_at?: string }): Promise<void> {
  const createdAt = params.created_at ?? new Date().toISOString();
  await db.runAsync(
    `INSERT INTO ai_ethics (entry_id, details, created_at) VALUES (?, ?, ?)`,
    [params.entry_id, params.details, createdAt]
  );
}
