// source_reference: test fixture for governed Schema V2 auth-profile-authority-sync-0514
// operational_decision: test-only SQLite setup validates generic role/profile authority synchronization
// dry_run_required: false (local disposable SQLite test only)
// rollback_plan_required: false (local disposable SQLite test only)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/auth-profile-authority-sync-0514.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runSql(dbPath, sql) {
  return spawnSync('sqlite3', [dbPath], { input: sql, encoding: 'utf8' });
}

function query(dbPath, sql) {
  const r = spawnSync('sqlite3', ['-noheader', dbPath, sql], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('0514 manifest pins reviewed SQL and plan hashes', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, 'auth-profile-authority-sync-0514');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0514 is generic and contains no user-specific authority grant', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath, 'utf8');
  assert.match(sql, /INSERT OR IGNORE INTO usuarios_empresas_perfis/i);
  assert.match(sql, /AFTER INSERT ON usuarios_empresas/i);
  assert.match(sql, /AFTER UPDATE OF role ON usuarios_empresas/i);
  assert.doesNotMatch(sql, /@/);
  assert.doesNotMatch(sql, /\busuario_id\s*=\s*\d+/i);
  assert.doesNotMatch(sql, /\bempresa_id\s*=\s*\d+/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+usuarios_empresas_perfis\b/i);
});

test('0514 closes existing gap and preserves the invariant on insert and role update', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath, 'utf8');
  const dir = mkdtempSync(path.join(tmpdir(), 'airtrust-0514-'));
  const dbPath = path.join(dir, 'db.sqlite');
  const setup = `
    CREATE TABLE usuarios_empresas (
      usuario_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      role TEXT,
      UNIQUE(usuario_id, empresa_id)
    );
    CREATE TABLE usuarios_empresas_perfis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      perfil TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(usuario_id, empresa_id, perfil)
    );
    INSERT INTO usuarios_empresas(usuario_id,empresa_id,role) VALUES (148,6,'USUARIO');
  `;
  assert.equal(runSql(dbPath, setup).status, 0);
  assert.equal(runSql(dbPath, sql).status, 0);
  assert.equal(runSql(dbPath, sql).status, 0, '0514 must be idempotent');
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE usuario_id=148 AND empresa_id=6 AND perfil='USUARIO';`), '1');

  assert.equal(runSql(dbPath, `INSERT INTO usuarios_empresas(usuario_id,empresa_id,role) VALUES (200,6,'ALUNO');`).status, 0);
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE usuario_id=200 AND empresa_id=6 AND perfil='ALUNO';`), '1');

  assert.equal(runSql(dbPath, `UPDATE usuarios_empresas SET role='GESTOR' WHERE usuario_id=200 AND empresa_id=6;`).status, 0);
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE usuario_id=200 AND empresa_id=6 AND perfil='GESTOR';`), '1');
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE usuario_id=200 AND empresa_id=6 AND perfil='ALUNO';`), '1');
});

test('Schema V2 builder accepts 0514 and appends exactly one ledger row', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0514-bundle-')), 'apply.sql');
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath: out,
    expectedChangeId: 'auth-profile-authority-sync-0514',
    githubSha: 'a'.repeat(40),
  });
  assert.equal(result.changeId, 'auth-profile-authority-sync-0514');
  const applied = readFileSync(out, 'utf8');
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, /trg_usuarios_empresas_profile_authority_insert/);
  assert.match(applied, /trg_usuarios_empresas_profile_authority_role_update/);
});
