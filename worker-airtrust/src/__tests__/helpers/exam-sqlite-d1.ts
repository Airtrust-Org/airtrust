import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};
type SqliteValue = string | number | bigint | Uint8Array | null;
const norm = (v: unknown): SqliteValue =>
  v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqliteValue);

/** Minimal real-SQLite D1 stand-in: enforces the actual DDL, triggers and indexes. */
class Statement {
  constructor(private readonly owner: ExamSqliteD1, readonly sql: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.owner, this.sql, values); }
  private args() { return this.values.map(norm); }
  async run() {
    const r = this.owner.database.prepare(this.sql).run(...this.args());
    return { success: true, meta: { changes: Number(r.changes || 0) }, results: [] };
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.owner.database.prepare(this.sql).get(...this.args()) as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    return { success: true, results: this.owner.database.prepare(this.sql).all(...this.args()) as T[] };
  }
}
export class ExamSqliteD1 {
  readonly database = new NodeDatabaseSync(':memory:');
  constructor() { this.database.exec('PRAGMA foreign_keys=ON'); }
  exec(sql: string) { this.database.exec(sql); }
  prepare(sql: string) { return new Statement(this, sql); }
  asD1(): D1Database { return this as unknown as D1Database; }
}
