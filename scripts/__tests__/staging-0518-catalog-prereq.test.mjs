// source_reference: staging D1 0518 apply failures 2026-09-30 (QUALIFICATION_CATEGORY_INVALID; missing CRM_CORP postcondition) + production canonical catalog read-only comparison
// operational_decision: preserve immutable production Schema V2 0518 and bootstrap only its non-PII catalog prerequisites in staging atomically
// dry_run_required: true
// rollback_plan_required: verified staging D1 backup + D1 Time Travel recovery point captured by apply-approved-migration-with-recovery-point.sh
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { adaptStagingMigrationSql } from '../staging/staging-migration-adapters.mjs';

const NAME = '0518_crm_qualification_consolidation.sql';

test('0518 staging adapter bootstraps only canonical non-PII catalog prerequisites', () => {
  const canonical = readFileSync(`worker-airtrust/migrations/${NAME}`, 'utf8');
  const adapted = adaptStagingMigrationSql({ migrationName: NAME, migrationSql: canonical });
  assert.match(adapted, /SELECT 3,'Teórico','TERICO'/);
  assert.match(adapted, /INSERT INTO qualificacoes_categorias/);
  assert.match(adapted, /SELECT 13,'EAD','EAD'/);
  assert.match(adapted, /INSERT INTO qualificacoes_formatos/);
  assert.match(adapted, /SELECT 1,'EAD','EAD'/);
  assert.match(adapted, /SELECT 'CRM_CORP','CRM — Corporate'/);
  assert.match(adapted, /'TREINAMENTO','CORPORATIVO',4/);
  assert.ok(adapted.endsWith(canonical));
  assert.equal(readFileSync('worker-airtrust/schema-v2/changes/0518_crm_qualification_consolidation.sql', 'utf8'), canonical);
});

test('staging adapter is a no-op for every other migration', () => {
  const sql = 'SELECT 1;\n';
  assert.equal(adaptStagingMigrationSql({ migrationName: '0521_training_compliance_designation_overrides.sql', migrationSql: sql }), sql);
});

test('0518 staging pre/post guards and recovery runner remain syntactically valid', () => {
  for (const file of [
    'scripts/staging/validate-0518-preflight.sh',
    'scripts/staging/validate-0518-postconditions.sh',
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
  ]) {
    const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const runner = readFileSync('scripts/staging/apply-approved-migration-with-recovery-point.sh', 'utf8');
  assert.match(runner, /SPECIALIZED_PREFLIGHT_0518_OK=true/);
  assert.match(runner, /adaptStagingMigrationSql/);
});


test('0518 staging bootstrap satisfies the live 0457 category FK contract', () => {
  const canonical = readFileSync(`worker-airtrust/migrations/${NAME}`, 'utf8');
  const adapted = adaptStagingMigrationSql({ migrationName: NAME, migrationSql: canonical });
  const bootstrap = adapted.slice(0, adapted.length - canonical.length).trim();
  const db = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0518-staging-')), 'db.sqlite');
  const setup = `
    CREATE TABLE qualificacoes_categorias(id INTEGER PRIMARY KEY,nome TEXT NOT NULL,codigo TEXT NOT NULL,descricao TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,cor TEXT,ativo INTEGER DEFAULT 1,empresa_id INTEGER,dominio_codigo TEXT,lms_integrada INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE qualificacoes_formatos(id INTEGER PRIMARY KEY,nome TEXT NOT NULL,codigo TEXT NOT NULL,descricao TEXT,cor TEXT,ativo INTEGER NOT NULL DEFAULT 1,empresa_id INTEGER NOT NULL,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER NOT NULL,codigo TEXT NOT NULL,nome TEXT NOT NULL,categoria TEXT,categoria_id INTEGER,formato_id INTEGER,classe_requisito TEXT,dominio_codigo TEXT,area_id INTEGER,ativo INTEGER DEFAULT 1,is_check INTEGER NOT NULL DEFAULT 0,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    INSERT INTO qualificacoes_categorias(id,nome,codigo,ativo,empresa_id,lms_integrada) VALUES(601,'Treinamentos Operacionais','TREINAMENTO_OPERACIONAL',1,6,0);
    CREATE TABLE qualificacoes_areas(id INTEGER PRIMARY KEY,codigo TEXT,empresa_id INTEGER,ativo INTEGER,deleted_at TEXT);
    INSERT INTO qualificacoes_areas(id,codigo,empresa_id,ativo) VALUES(4,'SEGURANCA_OPERACIONAL',6,1);
    CREATE TRIGGER trg_qualification_type_category_fk_insert_0457 BEFORE INSERT ON qualificacoes_tipos WHEN NEW.deleted_at IS NULL BEGIN
      SELECT CASE WHEN NEW.categoria_id IS NULL OR NOT EXISTS (SELECT 1 FROM qualificacoes_categorias qc WHERE qc.id=NEW.categoria_id AND qc.empresa_id=NEW.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL) THEN RAISE(ABORT,'QUALIFICATION_CATEGORY_INVALID') END;
    END;
    CREATE TRIGGER trg_qualification_type_category_snapshot_insert_0457 AFTER INSERT ON qualificacoes_tipos WHEN NEW.deleted_at IS NULL BEGIN
      UPDATE qualificacoes_tipos SET categoria=(SELECT qc.nome FROM qualificacoes_categorias qc WHERE qc.id=NEW.categoria_id AND qc.empresa_id=NEW.empresa_id) WHERE id=NEW.id AND empresa_id=NEW.empresa_id;
    END;
  `;
  assert.equal(spawnSync('sqlite3', [db], { input: setup, encoding: 'utf8' }).status, 0);
  const before = spawnSync('sqlite3', [db], { input: "INSERT INTO qualificacoes_tipos(empresa_id,codigo,nome,categoria,categoria_id,formato_id) VALUES(6,'CRM_DIR_RBAC119','Gestor','EAD',(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),(SELECT id FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1));", encoding: 'utf8' });
  assert.notEqual(before.status, 0);
  assert.match(before.stderr, /QUALIFICATION_CATEGORY_INVALID/);
  assert.equal(spawnSync('sqlite3', [db], { input: bootstrap, encoding: 'utf8' }).status, 0);
  const seeded = spawnSync('sqlite3', [db], { input: "SELECT codigo||'|'||categoria_id||'|'||COALESCE(formato_id,'NULL')||'|'||classe_requisito||'|'||dominio_codigo||'|'||area_id FROM qualificacoes_tipos WHERE codigo='CRM_CORP';", encoding: 'utf8' });
  assert.equal(seeded.status, 0, seeded.stderr);
  assert.equal(seeded.stdout.trim(), 'CRM_CORP|3|NULL|TREINAMENTO|CORPORATIVO|4');
  const after = spawnSync('sqlite3', [db], { input: "INSERT INTO qualificacoes_tipos(empresa_id,codigo,nome,categoria,categoria_id,formato_id) VALUES(6,'CRM_DIR_RBAC119','Gestor','EAD',(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),(SELECT id FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)); SELECT categoria||'|'||categoria_id||'|'||formato_id FROM qualificacoes_tipos WHERE codigo='CRM_DIR_RBAC119';", encoding: 'utf8' });
  assert.equal(after.status, 0, after.stderr);
  assert.equal(after.stdout.trim(), 'EAD|13|1');
});
