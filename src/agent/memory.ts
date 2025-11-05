import AsyncStorage from '@react-native-async-storage/async-storage';
import { embedText, l2Normalize } from '@/agent/embeddings';
import { supabase } from '@/lib/supabase';
import { getOperatingPicture, ragSearch } from '@/services/memory';
import type { OperatingPicture, RagResult } from '@/services/memory';
import type { RoutedIntent } from '@/agent/types';

const SQLITE_DB_NAME = 'riflett-memory.db';
const STORAGE_KEY = 'riflett_memory_store';
const MAX_CACHED_ROWS = 512;
const REMOTE_BRIEF_LIMIT = 9;

const resolveUserId = async (): Promise<string | null> => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.warn('[memory] resolveUserId failed', error);
    return null;
  }
  return user?.id ?? null;
};

type SQLiteResultSet = {
  rows: {
    length: number;
    item: (index: number) => any;
    _array: any[];
  };
  rowsAffected?: number | undefined;
  insertId?: number | undefined;
};

type LegacySQLiteTransaction = {
  executeSql: (
    sql: string,
    params: any[],
    success?: (tx: LegacySQLiteTransaction, result: SQLiteResultSet) => void,
    error?: (tx: LegacySQLiteTransaction, error: Error) => boolean
  ) => void;
};

type LegacySQLiteDatabase = {
  transaction: (
    callback: (tx: LegacySQLiteTransaction) => void,
    error?: (error: Error) => void,
    success?: () => void
  ) => void;
};

type ModernSQLiteExecuteResult<T = any> = {
  getAllAsync: () => Promise<T[]>;
  getFirstAsync: () => Promise<T | null>;
  resetAsync: () => Promise<void>;
  readonly changes: number;
  readonly lastInsertRowId: number;
};

type ModernSQLiteStatement = {
  executeAsync: (...params: any[]) => Promise<ModernSQLiteExecuteResult>;
  finalizeAsync: () => Promise<void>;
};

type ModernSQLiteDatabase = {
  prepareAsync: (sql: string) => Promise<ModernSQLiteStatement>;
};

type ExpoSqliteModule = Partial<
  {
    openDatabase: (name: string) => LegacySQLiteDatabase;
    openDatabaseAsync: (name: string) => Promise<ModernSQLiteDatabase>;
    openDatabaseSync: (name: string) => ModernSQLiteDatabase;
  }
>;

type SQLiteDatabase = LegacySQLiteDatabase | ModernSQLiteDatabase;

let sqliteDb: SQLiteDatabase | null = null;
let sqliteFlavor: 'legacy' | 'modern' | null = null;
let sqliteReady = false;
let initialized: Promise<void> | null = null;

const memoryCache = new Map<string, MemoryRow>();

interface MemoryRow {
  id: string;
  kind: MemoryKind;
  text: string;
  ts: number;
  embedding: number[];
}

const mapKindsToRag = (kinds: string[]): RagKind[] => {
  const set = new Set(kinds.map((kind) => kind.toLowerCase()))
  const mapped: RagKind[] = []
  if (set.has('entry') || set.has('journal') || set.has('pref')) {
    mapped.push('entry')
  }
  if (set.has('goal')) {
    mapped.push('goal')
  }
  if (set.has('schedule') || set.has('event')) {
    mapped.push('schedule')
  }
  return mapped
}

const inferScopeFromIntent = (intent: RoutedIntent | null | undefined): RagScopeInput => {
  if (!intent) return 'all'
  const label = intent.label?.toLowerCase() ?? ''
  const scopes: RagKind[] = []
  if (label.includes('goal')) {
    scopes.push('goal')
  }
  if (label.includes('schedule') || label.includes('calendar')) {
    scopes.push('schedule')
  }
  if (scopes.length === 0 || label.includes('journal') || label.includes('reflect')) {
    scopes.push('entry')
  }
  return scopes.length ? scopes : 'all'
}

export type MemoryKind = 'entry' | 'goal' | 'event' | 'pref' | 'schedule';
type RagKind = 'entry' | 'goal' | 'schedule';
type RagScopeInput = RagKind | RagKind[] | 'all';

export interface MemoryRecord extends MemoryRow {
  score: number;
}

interface SearchOptions {
  query: string;
  kinds: string[];
  topK: number;
}

interface UpsertOptions {
  id: string;
  kind: MemoryKind;
  text: string;
  ts?: number;
  embedding?: number[];
}

const executeSql = async (sql: string, params: any[] = []): Promise<SQLiteResultSet | null> => {
  if (!sqliteDb) return null;

  if (sqliteFlavor === 'legacy' && sqliteDb && isLegacyDatabase(sqliteDb)) {
    const legacyDb = sqliteDb;
    return new Promise((resolve, reject) => {
      legacyDb.transaction(
        (tx: LegacySQLiteTransaction) => {
          tx.executeSql(
            sql,
            params,
            (_tx: LegacySQLiteTransaction, result: SQLiteResultSet) => {
              resolve(result);
            },
            (_tx: LegacySQLiteTransaction, error: Error) => {
              reject(error);
              return false;
            }
          );
        },
        (error: Error) => reject(error)
      );
    });
  }

  if (sqliteFlavor === 'modern' && sqliteDb && isModernDatabase(sqliteDb)) {
    const modernDb = sqliteDb;
    let statement: ModernSQLiteStatement | null = null;
    try {
      statement = await modernDb.prepareAsync(sql);
      const iterator = await statement.executeAsync(params);
      const rowsArray = await iterator.getAllAsync();
      const result: SQLiteResultSet = {
        rows: {
          length: rowsArray.length,
          item: (index: number) => rowsArray[index],
          _array: rowsArray,
        },
      };
      if (typeof iterator.changes === 'number') {
        result.rowsAffected = iterator.changes;
      }
      if (typeof iterator.lastInsertRowId === 'number' && Number.isFinite(iterator.lastInsertRowId)) {
        result.insertId = iterator.lastInsertRowId;
      }
      return result;
    } finally {
      if (statement) {
        try {
          await statement.finalizeAsync();
        } catch (finalizeError) {
          console.warn('[memory] Failed to finalize SQLite statement', finalizeError);
        }
      }
    }
  }

  return null;
};

const loadSqliteModule = (): ExpoSqliteModule | null => {
  try {
    // Use CommonJS require to avoid Metro async shim.
    const baseModule = require('expo-sqlite') as ExpoSqliteModule & {
      default?: ExpoSqliteModule;
      legacy?: ExpoSqliteModule;
    };

    const candidates = [baseModule, baseModule?.default, baseModule?.legacy].filter(
      (candidate): candidate is ExpoSqliteModule =>
        !!candidate && typeof candidate === 'object'
    );

    for (const candidate of candidates) {
      if (
        typeof candidate.openDatabaseAsync === 'function' ||
        typeof candidate.openDatabaseSync === 'function' ||
        typeof candidate.openDatabase === 'function'
      ) {
        return candidate;
      }
    }

    console.warn('[memory] expo-sqlite module loaded without an openDatabase entrypoint');
    return null;
  } catch (error) {
    console.warn('[memory] expo-sqlite unavailable', error);
    return null;
  }
};

const isLegacyDatabase = (db: SQLiteDatabase): db is LegacySQLiteDatabase =>
  typeof (db as LegacySQLiteDatabase).transaction === 'function';

const isModernDatabase = (db: SQLiteDatabase): db is ModernSQLiteDatabase =>
  typeof (db as ModernSQLiteDatabase).prepareAsync === 'function';

const tryInitSqlite = async (): Promise<boolean> => {
  if (sqliteReady) return true;

  try {
    const sqliteModule = loadSqliteModule();
    if (!sqliteModule) {
      sqliteDb = null;
      sqliteFlavor = null;
      sqliteReady = false;
      return false;
    }
    if (typeof sqliteModule.openDatabaseAsync === 'function') {
      sqliteDb = await sqliteModule.openDatabaseAsync(SQLITE_DB_NAME);
    } else if (typeof sqliteModule.openDatabaseSync === 'function') {
      sqliteDb = sqliteModule.openDatabaseSync(SQLITE_DB_NAME);
    } else if (typeof sqliteModule.openDatabase === 'function') {
      sqliteDb = sqliteModule.openDatabase(SQLITE_DB_NAME);
    } else {
      throw new Error('expo-sqlite module does not expose an openDatabase function');
    }

    if (sqliteDb && isModernDatabase(sqliteDb)) {
      sqliteFlavor = 'modern';
    } else if (sqliteDb && isLegacyDatabase(sqliteDb)) {
      sqliteFlavor = 'legacy';
    } else {
      throw new Error('expo-sqlite returned an unsupported database instance');
    }

    await executeSql(
      'CREATE TABLE IF NOT EXISTS memory (id TEXT PRIMARY KEY, kind TEXT, text TEXT, ts INTEGER, embedding TEXT)'
    );
    await executeSql(
      'CREATE INDEX IF NOT EXISTS idx_memory_kind_ts ON memory(kind, ts DESC)'
    );

    const result = await executeSql('SELECT id, kind, text, ts, embedding FROM memory');
    if (result && Array.isArray(result.rows?._array)) {
      result.rows._array.forEach((row: any) => {
        const parsed: MemoryRow = {
          id: row.id,
          kind: row.kind,
          text: row.text,
          ts: row.ts,
          embedding: parseEmbedding(row.embedding),
        };
        memoryCache.set(parsed.id, parsed);
      });
    }

    sqliteReady = true;
    return true;
  } catch (error) {
    console.warn('[memory] SQLite init failed, using AsyncStorage fallback', error);
    sqliteDb = null;
    sqliteFlavor = null;
    sqliteReady = false;
    return false;
  }
};

const parseEmbedding = (raw: unknown): number[] => {
  if (Array.isArray(raw)) {
    return l2Normalize(raw.map((v) => Number(v)));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as number[];
      return l2Normalize(parsed.map((v) => Number(v)));
    } catch (error) {
      console.warn('[memory] Failed to parse embedding JSON', error);
    }
  }
  return [];
};

const serializeEmbedding = (embedding: number[]): string => JSON.stringify(embedding);

const ensureInitialized = async (): Promise<void> => {
  if (!initialized) {
    initialized = (async () => {
      const sqliteAvailable = await tryInitSqlite();
      if (!sqliteAvailable) {
        await hydrateFromStorage();
      }
    })();
  }
  return initialized;
};

const hydrateFromStorage = async (): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as MemoryRow[];
    parsed.forEach((row) => {
      memoryCache.set(row.id, {
        ...row,
        embedding: Array.isArray(row.embedding)
          ? l2Normalize(row.embedding.map((v) => Number(v)))
          : [],
      });
    });
  } catch (error) {
    console.warn('[memory] hydrate fallback failed', error);
  }
};

const persistFallback = async (): Promise<void> => {
  const subset = Array.from(memoryCache.values())
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_CACHED_ROWS)
    .map((row) => ({
      ...row,
      embedding: row.embedding,
    }));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(subset));
  } catch (error) {
    console.warn('[memory] persist fallback failed', error);
  }
};

const cosineScores = (query: number[], rows: MemoryRow[]): MemoryRecord[] => {
  const normalizedQuery = l2Normalize(query);
  const scores = rows.map((row) => {
    const embedding = row.embedding;
    const length = Math.min(normalizedQuery.length, embedding.length);
    let dot = 0;
    for (let i = 0; i < length; i += 1) {
      dot += normalizedQuery[i]! * embedding[i]!;
    }
    return {
      ...row,
      score: dot,
    };
  });

  return scores.sort((a, b) => b.score - a.score);
};

export const Memory = {
  async searchTopN(options: SearchOptions): Promise<MemoryRecord[]> {
    await ensureInitialized();
    const topK = Math.max(1, Math.min(options.topK || 5, 20));
    const userId = await resolveUserId();
    if (userId) {
      try {
        const scopeKinds = mapKindsToRag(options.kinds);
        const ragScope = scopeKinds.length ? scopeKinds : 'all';
        const ragResults = await ragSearch(
          userId,
          options.query,
          ragScope,
          { limit: topK }
        );
        if (ragResults.length) {
          const nowTs = Date.now();
          const remoteRecords: MemoryRecord[] = [];
          for (const [index, result] of ragResults.entries()) {
            const text = result.snippet ?? '';
            let embedding: number[] = [];
            try {
              embedding = await embedText(text);
            } catch (error) {
              console.warn('[memory] embedding cache failure', error);
            }
            const record: MemoryRecord = {
              id: `${result.kind}:${result.id}`,
              kind: (result.kind as MemoryKind) ?? 'entry',
              text,
              ts: nowTs - index,
              embedding,
              score: result.score,
            };
            remoteRecords.push(record);
            try {
              await Memory.upsert({
                id: record.id,
                kind: record.kind,
                text: record.text,
                ts: record.ts,
                embedding: record.embedding,
              });
            } catch (error) {
              console.warn('[memory] remote cache upsert failed', error);
            }
          }
          return remoteRecords.slice(0, topK);
        }
      } catch (error) {
        console.warn('[memory] remote search failed, falling back', error);
      }
    }

    const kinds = options.kinds.map((kind) => kind.toLowerCase());
    const queryVector = await embedText(options.query);

    if (sqliteReady && sqliteDb) {
      const placeholders = kinds.length
        ? kinds.map(() => '?').join(',')
        : '?';
      const params = kinds.length ? kinds : ['entry'];
      const result = await executeSql(
        `SELECT id, kind, text, ts, embedding FROM memory WHERE kind IN (${placeholders}) ORDER BY ts DESC LIMIT 512`,
        params
      );

      const rows: MemoryRow[] = result && result.rows
        ? result.rows._array.map((row: any) => ({
            id: row.id,
            kind: row.kind,
            text: row.text,
            ts: row.ts,
            embedding: parseEmbedding(row.embedding),
          }))
        : [];

      return cosineScores(queryVector, rows).slice(0, topK);
    }

    const rows = Array.from(memoryCache.values()).filter((row) =>
      kinds.length ? kinds.includes(row.kind.toLowerCase()) : true
    );

    return cosineScores(queryVector, rows).slice(0, topK);
  },

  async getBrief(
    uid: string | null,
    intent: RoutedIntent,
    query: string,
    options: { limit?: number } = {}
  ): Promise<{
    operatingPicture: OperatingPicture;
    rag: RagResult[];
    memoryRecords: MemoryRecord[];
  }> {
    await ensureInitialized();
    const userId = uid ?? (await resolveUserId());
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const limit = Math.max(3, Math.min(options.limit ?? REMOTE_BRIEF_LIMIT, REMOTE_BRIEF_LIMIT));
    const [operatingPicture, ragResults] = await Promise.all([
      getOperatingPicture(userId),
      ragSearch(userId, query, inferScopeFromIntent(intent), { limit }),
    ]);

    const memoryRecords: MemoryRecord[] = [];
    const nowTs = Date.now();

    for (const [index, result] of ragResults.entries()) {
      const text = result.snippet ?? '';
      let embedding: number[] = [];
      try {
        embedding = await embedText(text);
      } catch (error) {
        console.warn('[memory] brief embedding failed', error);
      }
      const record: MemoryRecord = {
        id: `${result.kind}:${result.id}`,
        kind: (result.kind as MemoryKind) ?? 'entry',
        text,
        ts: nowTs - index,
        embedding,
        score: result.score,
      };
      memoryRecords.push(record);
      try {
        await Memory.upsert({
          id: record.id,
          kind: record.kind,
          text: record.text,
          ts: record.ts,
          embedding: record.embedding,
        });
      } catch (error) {
        console.warn('[memory] brief cache upsert failed', error);
      }
    }

    return {
      operatingPicture,
      rag: ragResults,
      memoryRecords,
    };
  },

  async upsert(options: UpsertOptions): Promise<void> {
    await ensureInitialized();

    const ts = options.ts ?? Date.now();
    const embedding = options.embedding ?? (await embedText(options.text));
    const normalized = l2Normalize(embedding);
    const row: MemoryRow = {
      id: options.id,
      kind: options.kind,
      text: options.text,
      ts,
      embedding: normalized,
    };

    memoryCache.set(row.id, row);

    if (sqliteReady && sqliteDb) {
      await executeSql(
        'REPLACE INTO memory (id, kind, text, ts, embedding) VALUES (?, ?, ?, ?, ?)',
        [row.id, row.kind, row.text, row.ts, serializeEmbedding(row.embedding)]
      );
    } else {
      await persistFallback();
    }
  },

  async remove(id: string): Promise<void> {
    await ensureInitialized();
    memoryCache.delete(id);
    if (sqliteReady && sqliteDb) {
      await executeSql('DELETE FROM memory WHERE id = ?', [id]);
    } else {
      await persistFallback();
    }
  },

  async warmup(): Promise<void> {
    await ensureInitialized();
    // Trigger a trivial embedding to warm up the model / thread
    await embedText('hi');
  },
};

export type MemorySearchResult = Awaited<ReturnType<typeof Memory.searchTopN>>;
