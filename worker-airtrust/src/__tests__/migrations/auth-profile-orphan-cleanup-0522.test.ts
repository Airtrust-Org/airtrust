import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const migrationPath = 'worker-airtrust/migrations/0522_auth_profile_orphan_cleanup.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0522_auth_profile_orphan_cleanup.sql';
const planPath = 'worker-airtrust/schema-v2/plans/auth-profile-orphan-cleanup-0522.md';
const manifestPath = 'worker-airtrust/schema-v2/auth-profile-orphan-cleanup-0522.json';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-auth-0522-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  const setup = execSql(db, `
    CREATE TABLE usuarios_empresas (
      usuario_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL, role TEXT
    );
    CREATE TABLE usuarios_empresas_perfis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL, perfil TEXT NOT NULL,
      ativo INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT,
      UNIQUE(usuario_id, empresa_id, perfil)
    );
    INSERT INTO usuarios_empresas VALUES (10, 1, 'admin'), (20, 2, 'viewer');
    INSERT INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo) VALUES
      (10, 1, 'admin', 1),
      (10, 1, 'manager', 1),
      (30, 3, 'viewer', 1),
      (40, 4, 'manager', 1);
  `);
  expect(setup.code, setup.stderr).toBe(0);
  return db;
}

describe('0522 auth profile orphan cleanup', () => {
  it('pins Schema V2 change, migration and plan hashes', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'auth-profile-orphan-cleanup-0522',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('removes only orphan profile authority and preserves valid multi-profile grants', () => {
    const db = createDatabase();
    const applied = execSql(db, migration);
    expect(applied.code, applied.stderr).toBe(0);
    const rows = querySql<{ usuario_id: number; empresa_id: number; perfil: string }>(
      db,
      'SELECT usuario_id, empresa_id, perfil FROM usuarios_empresas_perfis ORDER BY usuario_id, perfil;',
    );
    expect(rows).toEqual([
      { usuario_id: 10, empresa_id: 1, perfil: 'admin' },
      { usuario_id: 10, empresa_id: 1, perfil: 'manager' },
      { usuario_id: 20, empresa_id: 2, perfil: 'viewer' },
    ]);
  });

  it('keeps role authority synchronized for new memberships and role updates', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, "INSERT INTO usuarios_empresas VALUES (50, 5, 'viewer');").code).toBe(0);
    expect(execSql(db, "UPDATE usuarios_empresas SET role='manager' WHERE usuario_id=50 AND empresa_id=5;").code).toBe(0);
    const profiles = querySql<{ perfil: string }>(
      db,
      'SELECT perfil FROM usuarios_empresas_perfis WHERE usuario_id=50 AND empresa_id=5 ORDER BY perfil;',
    );
    expect(profiles).toEqual([{ perfil: 'manager' }, { perfil: 'viewer' }]);
  });

  it('removes explicit profiles automatically when the tenant membership is deleted', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, 'DELETE FROM usuarios_empresas WHERE usuario_id=10 AND empresa_id=1;').code).toBe(0);
    expect(
      querySql<{ total: number }>(
        db,
        'SELECT COUNT(*) total FROM usuarios_empresas_perfis WHERE usuario_id=10 AND empresa_id=1;',
      )[0].total,
    ).toBe(0);
    expect(
      querySql<{ total: number }>(
        db,
        'SELECT COUNT(*) total FROM usuarios_empresas_perfis WHERE usuario_id=20 AND empresa_id=2;',
      )[0].total,
    ).toBe(1);
  });

  it('is idempotent', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);
    expect(
      querySql<{ total: number }>(db, "SELECT COUNT(*) total FROM sqlite_master WHERE type='trigger' AND name='trg_usuarios_empresas_profile_authority_delete';")[0].total,
    ).toBe(1);
  });
});
