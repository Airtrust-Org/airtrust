import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type TableColumn = {
  name: string;
};

type IndexRow = {
  name: string;
};

describe('migration 0389 platform roles + support access foundation schema', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-platform-access-'));
  const databasePath = join(tempDir, 'schema.sqlite');
  const migrationSql = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../migrations/0389_platform_roles_support_access_foundation.sql',
    ),
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
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT
      );
      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT
      );
      ${migrationSql}
      ${migrationSql}
    `);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the three additive foundation tables', () => {
    const tables = queryJson<{ name: string }>(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('user_platform_roles', 'support_access_grants', 'support_access_sessions')
      ORDER BY name;
      `,
    );

    expect(tables.map((row) => row.name)).toEqual([
      'support_access_grants',
      'support_access_sessions',
      'user_platform_roles',
    ]);
  });

  it('pins the required columns on user_platform_roles', () => {
    const columns = queryJson<TableColumn>('PRAGMA table_info(user_platform_roles);');
    expect(columns.map((col) => col.name)).toEqual([
      'id',
      'user_id',
      'role_code',
      'granted_by_user_id',
      'granted_reason',
      'expires_at',
      'created_at',
      'updated_at',
      'revoked_at',
      'revoked_by_user_id',
      'revoked_reason',
    ]);
  });

  it('creates the active-lookup indexes for platform roles and support grants', () => {
    const platformIndexes = queryJson<IndexRow>('PRAGMA index_list(user_platform_roles);');
    const supportIndexes = queryJson<IndexRow>('PRAGMA index_list(support_access_grants);');
    const sessionIndexes = queryJson<IndexRow>('PRAGMA index_list(support_access_sessions);');

    expect(platformIndexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_user_platform_roles_active_unique',
        'idx_user_platform_roles_lookup',
      ]),
    );
    expect(supportIndexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_support_access_grants_active_unique',
        'idx_support_access_grants_lookup',
      ]),
    );
    expect(sessionIndexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_support_access_sessions_active',
        'idx_support_access_sessions_request',
      ]),
    );
  });

  it('accepts additive inserts for persisted platform role, grant and session', () => {
    sqlite(`
      INSERT INTO usuarios (id, email) VALUES (1, 'root@airtrust.local'), (44, 'support@airtrust.local');
      INSERT INTO empresas (id, codigo) VALUES (7, 'tenant-7');

      INSERT INTO user_platform_roles (
        user_id, role_code, granted_by_user_id, granted_reason
      ) VALUES (
        44, 'support_read_only', 1, 'ticket-4812'
      );

      INSERT INTO support_access_grants (
        user_id, empresa_id, access_level, granted_by_user_id, granted_reason
      ) VALUES (
        44, 7, 'read_only', 1, 'ticket-4812'
      );

      INSERT INTO support_access_sessions (
        id, user_id, empresa_id, access_level, support_reason, request_id
      ) VALUES (
        'support-session-001', 44, 7, 'read_only', 'ticket-4812', 'req-4812'
      );
    `);

    const [role] = queryJson<{ role_code: string }>(
      `SELECT role_code FROM user_platform_roles WHERE user_id = 44;`,
    );
    const [grant] = queryJson<{ access_level: string }>(
      `SELECT access_level FROM support_access_grants WHERE user_id = 44 AND empresa_id = 7;`,
    );
    const [session] = queryJson<{ support_reason: string }>(
      `SELECT support_reason FROM support_access_sessions WHERE id = 'support-session-001';`,
    );

    expect(role.role_code).toBe('support_read_only');
    expect(grant.access_level).toBe('read_only');
    expect(session.support_reason).toBe('ticket-4812');
  });
});
