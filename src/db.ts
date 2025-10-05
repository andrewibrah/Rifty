// src/db.ts
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

export type EntryType = "journal" | "goal" | "schedule";
export type Entry = {
  id?: number;
  type: EntryType;
  content: string;
  created_at?: string;
};

export type AnnotationChannel = "note" | "ai" | "system";
export type Annotation = {
  id?: number;
  entry_id: number;
  kind: "user" | "bot" | "system";
  channel: AnnotationChannel;
  content: string;
  created_at?: string;
};

// Web fallback storage
let webStorage: {
  entries: Entry[];
  annotations: Annotation[];
  learnings: Array<{
    id?: number;
    entry_id: number;
    insight: string;
    created_at?: string;
  }>;
  ethics: Array<{
    id?: number;
    entry_id: number;
    details: string;
    created_at?: string;
  }>;
} = {
  entries: [],
  annotations: [],
  learnings: [],
  ethics: [],
};

// Open database using the new Expo SQLite sync API (mobile only)
const db = Platform.OS === "web" ? null : SQLite.openDatabaseSync("riflett.db");

export async function initDB(): Promise<void> {
  if (Platform.OS === "web") {
    // Web: Initialize in-memory storage
    return;
  }

  await db!.execAsync(`
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
  await db!
    .execAsync(`ALTER TABLE annotations ADD COLUMN channel TEXT DEFAULT 'note'`)
    .catch(() => {
      // Ignore if the column already exists
    });
}

export async function insertEntry(e: {
  type: EntryType;
  content: string;
}): Promise<void> {
  if (Platform.OS === "web") {
    const newEntry: Entry = {
      id: webStorage.entries.length + 1,
      type: e.type,
      content: e.content,
      created_at: new Date().toISOString(),
    };
    webStorage.entries.push(newEntry);
    return;
  }

  await db!.runAsync(`INSERT INTO entries (type, content) VALUES (?, ?)`, [
    e.type,
    e.content,
  ]);
}

export async function listEntries(): Promise<Entry[]> {
  if (Platform.OS === "web") {
    return [...webStorage.entries].sort(
      (a, b) =>
        new Date(a.created_at || "").getTime() -
        new Date(b.created_at || "").getTime()
    );
  }

  return db!.getAllAsync(
    `SELECT id, type, content, created_at
     FROM entries
     ORDER BY datetime(created_at) ASC`
  ) as Promise<Entry[]>;
}

export async function listEntriesByType(type: EntryType): Promise<Entry[]> {
  if (Platform.OS === "web") {
    return webStorage.entries
      .filter((entry) => entry.type === type)
      .sort(
        (a, b) =>
          new Date(b.created_at || "").getTime() -
          new Date(a.created_at || "").getTime()
      );
  }

  return db!.getAllAsync(
    `SELECT id, type, content, created_at
     FROM entries
     WHERE type = ?
     ORDER BY datetime(created_at) DESC`,
    [type]
  ) as Promise<Entry[]>;
}

export async function getEntryById(id: number): Promise<Entry | null> {
  if (Platform.OS === "web") {
    return webStorage.entries.find((entry) => entry.id === id) || null;
  }

  const rows = (await db!.getAllAsync(
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
  kind: Annotation["kind"];
  channel?: AnnotationChannel;
  content: string;
  created_at?: string;
}): Promise<Annotation> {
  const createdAt = payload.created_at ?? new Date().toISOString();
  const channel = payload.channel ?? "note";

  if (Platform.OS === "web") {
    const newAnnotation: Annotation = {
      id: webStorage.annotations.length + 1,
      entry_id: payload.entry_id,
      kind: payload.kind,
      channel,
      content: payload.content,
      created_at: createdAt,
    };
    webStorage.annotations.push(newAnnotation);
    return newAnnotation;
  }

  const result = await db!.runAsync(
    `INSERT INTO annotations (entry_id, kind, channel, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.entry_id, payload.kind, channel, payload.content, createdAt]
  );

  const insertedRows = (await db!.getAllAsync(
    `SELECT id, entry_id, kind, channel, content, created_at
     FROM annotations
     WHERE id = ?
     LIMIT 1`,
    [result.lastInsertRowId]
  )) as Annotation[];

  const inserted = insertedRows[0];
  if (!inserted) throw new Error("Unable to load inserted annotation");
  return inserted;
}

export async function listAnnotationsForEntry(
  entry_id: number
): Promise<Annotation[]> {
  if (Platform.OS === "web") {
    return webStorage.annotations
      .filter((annotation) => annotation.entry_id === entry_id)
      .sort(
        (a, b) =>
          new Date(a.created_at || "").getTime() -
          new Date(b.created_at || "").getTime()
      );
  }

  return db!.getAllAsync(
    `SELECT id, entry_id, kind, channel, content, created_at
     FROM annotations
     WHERE entry_id = ?
     ORDER BY datetime(created_at) ASC`,
    [entry_id]
  ) as Promise<Annotation[]>;
}

export async function insertLearning(params: {
  entry_id: number;
  insight: string;
  created_at?: string;
}): Promise<void> {
  const createdAt = params.created_at ?? new Date().toISOString();

  if (Platform.OS === "web") {
    webStorage.learnings.push({
      id: webStorage.learnings.length + 1,
      entry_id: params.entry_id,
      insight: params.insight,
      created_at: createdAt,
    });
    return;
  }

  await db!.runAsync(
    `INSERT INTO ai_learnings (entry_id, insight, created_at) VALUES (?, ?, ?)`,
    [params.entry_id, params.insight, createdAt]
  );
}

export async function insertEthicalRecord(params: {
  entry_id: number;
  details: string;
  created_at?: string;
}): Promise<void> {
  const createdAt = params.created_at ?? new Date().toISOString();

  if (Platform.OS === "web") {
    webStorage.ethics.push({
      id: webStorage.ethics.length + 1,
      entry_id: params.entry_id,
      details: params.details,
      created_at: createdAt,
    });
    return;
  }

  await db!.runAsync(
    `INSERT INTO ai_ethics (entry_id, details, created_at) VALUES (?, ?, ?)`,
    [params.entry_id, params.details, createdAt]
  );
}

export async function deleteEntry(id: number): Promise<void> {
  if (Platform.OS === "web") {
    webStorage.entries = webStorage.entries.filter((entry) => entry.id !== id);
    webStorage.annotations = webStorage.annotations.filter(
      (ann) => ann.entry_id !== id
    );
    webStorage.learnings = webStorage.learnings.filter(
      (learning) => learning.entry_id !== id
    );
    webStorage.ethics = webStorage.ethics.filter((eth) => eth.entry_id !== id);
    return;
  }

  await db!.runAsync(`DELETE FROM entries WHERE id = ?`, [id]);
}

export async function deleteAllEntries(): Promise<void> {
  if (Platform.OS === "web") {
    webStorage.entries = [];
    webStorage.annotations = [];
    webStorage.learnings = [];
    webStorage.ethics = [];
    return;
  }

  // Delete all entries (cascading will delete annotations, learnings, ethics)
  await db!.runAsync(`DELETE FROM entries`);
}
