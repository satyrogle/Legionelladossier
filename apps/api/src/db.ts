import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './schema.js';

export type Db = DatabaseSync;
export type SqlValue = string | number | null;
export type Row = Record<string, string | number | null>;

/** Ordered schema upgrades. Index + 2 is the user_version each step produces (v1 is SCHEMA). */
const MIGRATIONS: readonly string[] = [
  // v2: links to the client's IWMS (TRIRIGA), structured locations, import audit
  `
  ALTER TABLE sites ADD COLUMN property TEXT;
  ALTER TABLE sites ADD COLUMN external_system TEXT;
  ALTER TABLE sites ADD COLUMN external_ref TEXT;
  ALTER TABLE sites ADD COLUMN external_path TEXT;
  ALTER TABLE assets ADD COLUMN floor TEXT;
  ALTER TABLE assets ADD COLUMN space TEXT;
  ALTER TABLE assets ADD COLUMN serial TEXT;
  ALTER TABLE assets ADD COLUMN classification TEXT;
  ALTER TABLE assets ADD COLUMN external_system TEXT;
  ALTER TABLE assets ADD COLUMN external_ref TEXT;
  ALTER TABLE assets ADD COLUMN external_record_id TEXT;
  ALTER TABLE assets ADD COLUMN external_path TEXT;
  CREATE INDEX IF NOT EXISTS sites_external ON sites(external_system, external_ref);
  CREATE INDEX IF NOT EXISTS assets_external ON assets(external_system, external_ref);
  CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    mode TEXT NOT NULL,
    filename TEXT,
    imported_by TEXT,
    created_at TEXT NOT NULL,
    summary TEXT NOT NULL,
    options TEXT
  );
  `,
];

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function schemaVersion(db: Db): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return Number(row.user_version);
}

export function migrate(db: Db): void {
  let version = Math.max(1, schemaVersion(db));
  for (let i = version - 1; i < MIGRATIONS.length; i += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 2}`);
    });
    version = i + 2;
  }
  if (schemaVersion(db) < version) db.exec(`PRAGMA user_version = ${version}`);
}

/** Run `fn` inside a transaction; roll back if it throws. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Coerce JS values into what node:sqlite binds: booleans to 0/1, undefined to NULL, objects to JSON. */
export function v(x: unknown): SqlValue {
  if (x === undefined || x === null) return null;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'number' || typeof x === 'string') return x;
  return JSON.stringify(x);
}

export function all(db: Db, sql: string, ...params: SqlValue[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

export function one(db: Db, sql: string, ...params: SqlValue[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}

export function run(db: Db, sql: string, ...params: SqlValue[]): number {
  return Number(db.prepare(sql).run(...params).changes);
}

export function str(row: Row, key: string): string | undefined {
  const x = row[key];
  return x === null || x === undefined ? undefined : String(x);
}

export function num(row: Row, key: string): number | undefined {
  const x = row[key];
  return x === null || x === undefined ? undefined : Number(x);
}

export function bool(row: Row, key: string): boolean {
  return Number(row[key] ?? 0) === 1;
}
