import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

/**
 * D1 de teste sobre SQLite real (node:sqlite) para os testes de backup.
 * Diferente de exam-sqlite-d1: expõe meta.last_row_id/changes como o D1 e tem o DDL das tabelas
 * de controle de backup copiado de produção (somente leitura, 2026-11-08).
 */
const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

type SqliteValue = string | number | bigint | Uint8Array | null;
const norm = (v: unknown): SqliteValue =>
  v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqliteValue);

class Statement {
  constructor(
    private readonly owner: BackupSqliteD1,
    readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Statement(this.owner, this.sql, values);
  }
  private args() {
    return this.values.map(norm);
  }
  async run() {
    const sql = this.owner.rewrite(this.sql);
    this.owner.executed.push(sql.replace(/\s+/g, ' ').trim());
    const r = this.owner.database.prepare(sql).run(...this.args());
    return {
      success: true,
      results: [],
      meta: { changes: Number(r.changes || 0), last_row_id: Number(r.lastInsertRowid || 0) },
    };
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const sql = this.owner.rewrite(this.sql);
    this.owner.executed.push(sql.replace(/\s+/g, ' ').trim());
    return (this.owner.database.prepare(sql).get(...this.args()) as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    const sql = this.owner.rewrite(this.sql);
    this.owner.executed.push(sql.replace(/\s+/g, ' ').trim());
    return {
      success: true,
      results: this.owner.database.prepare(sql).all(...this.args()) as T[],
    };
  }
}

export const BACKUP_CONTROL_DDL = `
CREATE TABLE backups_controle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK(tipo IN ('COMPLETO', 'MODULAR', 'INCREMENTAL', 'TIME_TRAVEL')),
  escopo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INICIADO' CHECK(status IN ('INICIADO', 'EM_PROGRESSO', 'CONCLUIDO', 'FALHOU', 'RESTAURANDO')),
  tamanho_bytes INTEGER,
  total_registros INTEGER,
  total_tabelas INTEGER,
  duracao_segundos INTEGER,
  r2_bucket TEXT NOT NULL DEFAULT 'airtrust-backups',
  r2_path TEXT NOT NULL,
  r2_checksum_sha256 TEXT,
  d1_backup_id TEXT,
  modulos_incluidos TEXT,
  triggered_by TEXT NOT NULL,
  usuarios_id INTEGER,
  descricao TEXT,
  retention_policy TEXT NOT NULL DEFAULT '7_ANOS',
  expires_at TEXT,
  compliance_tags TEXT,
  restaurado_em TEXT,
  restaurado_por INTEGER,
  restore_log TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE TABLE backups_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backups_controle_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nivel TEXT NOT NULL CHECK(nivel IN ('INFO', 'WARN', 'ERROR', 'SUCCESS')),
  mensagem TEXT NOT NULL,
  detalhes TEXT,
  tabela_afetada TEXT,
  registros_processados INTEGER,
  FOREIGN KEY (backups_controle_id) REFERENCES backups_controle(id)
);
`;

export class BackupSqliteD1 {
  readonly database = new NodeDatabaseSync(':memory:');
  /** SQL executado via D1 (normalizado), para asserções de "não tocou em X". */
  readonly executed: string[] = [];
  constructor(withControlTables = true) {
    this.database.exec('PRAGMA foreign_keys=ON');
    if (withControlTables) this.database.exec(BACKUP_CONTROL_DDL);
  }
  exec(sql: string) {
    this.database.exec(sql);
  }
  /**
   * `'now'` do SQLite ignora vi.useFakeTimers(); troca pelo relógio JS para testes determinísticos.
   * (Defaults de coluna, como CURRENT_TIMESTAMP, continuam com o relógio real: insira created_at.)
   */
  rewrite(sql: string): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return sql.replaceAll("'now'", `'${now}'`);
  }
  prepare(sql: string) {
    return new Statement(this, sql);
  }
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
