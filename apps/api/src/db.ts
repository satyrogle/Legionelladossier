import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './schema.js';

export type Db = DatabaseSync;
export type SqlValue = string | number | null;
export type Row = Record<string, string | number | null>;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
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
