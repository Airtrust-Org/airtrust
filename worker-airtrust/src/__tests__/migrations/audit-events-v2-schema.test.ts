import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type TableColumn = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
};

type IndexRow = {
  name: string;
};

const requiredColumns = [
  'id',
  'created_at',
  'empresa_id',
  'target_empresa_id',
  'actor_user_id',
  'actor_empresa_id',
  'actor_role',
  'actor_type',
  'support_mode',
  'support_reason',
  'request_id',
  'correlation_id',
  'ip_hash',
  'user_agent_hash',
  'event_category',
  'event_action',
  'entity_type',
  'entity_id',
  'risk_level',
  'success',
  'failure_reason_code',
  'metadata_sanitized_json',
  'retention_class',
];

const prohibitedColumns = [
  'password',
  'senha',
  'token',
  'cookie',
  'cpf',
  'documento_bruto',
  'aso_bruto',
  'raw_payload',
];

const requiredIndexes = [
  'idx_audit_events_v2_empresa_created',
  'idx_audit_events_v2_target_empresa_created',
  'idx_audit_events_v2_actor_created',
  'idx_audit_events_v2_request',
  'idx_audit_events_v2_category_created',
];

describe('migration 0385 audit_events_v2 schema', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-audit-events-v2-'));
  const databasePath = join(tempDir, 'schema.sqlite');
  const migrationSql = readFileSync(
    new URL('../../../migrations/0385_audit_events_v2.sql', import.meta.url),
    'utf8',
  );

  function sqlite(sql: string): string {
    const result = spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  function queryJson<T>(sql: string): T[] {
    const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
  }

  beforeAll(() => {
    sqlite(`
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      ${migrationSql}
    `);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the canonical v2 table with all required fields', () => {
    const tables = queryJson<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_events_v2';",
    );
    const columns = queryJson<TableColumn>('PRAGMA table_info(audit_events_v2);');

    expect(tables.map(({ name }) => name)).toEqual(['audit_events_v2']);
    expect(columns.map(({ name }) => name)).toEqual(requiredColumns);
  });

  it('creates the critical indexes', () => {
    const indexes = queryJson<IndexRow>('PRAGMA index_list(audit_events_v2);');

    expect(indexes.map(({ name }) => name)).toEqual(expect.arrayContaining(requiredIndexes));
  });

  it('accepts a minimal sanitized event and applies safe defaults', () => {
    const metadata = JSON.stringify({ source: 'synthetic-test', outcome: 'allowed' });
    sqlite(`
      INSERT INTO audit_events_v2 (
        id,
        event_category,
        event_action,
        metadata_sanitized_json
      ) VALUES (
        'audit-test-001',
        'SYSTEM',
        'SCHEMA_VALIDATION',
        '${metadata.replaceAll("'", "''")}'
      );
    `);

    const [event] = queryJson<{
      support_mode: number;
      success: number;
      retention_class: string;
      metadata_sanitized_json: string;
    }>(
      `SELECT support_mode, success, retention_class, metadata_sanitized_json
       FROM audit_events_v2
       WHERE id = 'audit-test-001';`,
    );

    expect(event.support_mode).toBe(0);
    expect(event.success).toBe(1);
    expect(event.retention_class).toBe('standard');
    expect(JSON.parse(event.metadata_sanitized_json)).toEqual({
      source: 'synthetic-test',
      outcome: 'allowed',
    });
  });

  it('does not add prohibited sensitive fields', () => {
    const columns = queryJson<TableColumn>('PRAGMA table_info(audit_events_v2);');
    const names = columns.map(({ name }) => name);

    for (const prohibited of prohibitedColumns) {
      expect(names).not.toContain(prohibited);
    }
  });

  it('does not alter the legacy audit_logs table', () => {
    const columns = queryJson<TableColumn>('PRAGMA table_info(audit_logs);');

    expect(columns.map(({ name }) => name)).toEqual(['id', 'action', 'created_at']);
  });
});
