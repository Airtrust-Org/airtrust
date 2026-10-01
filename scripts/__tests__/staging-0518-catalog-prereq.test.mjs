// source_reference: staging D1 0518 apply failures 2026-09-30 + production tenant 6 CRM reference catalog read-only comparison
// operational_decision: preserve immutable production Schema V2 0518 and bootstrap only non-PII CRM reference prerequisites in staging atomically
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

test('0518 staging adapter bootstraps only non-PII reference prerequisites missing from reduced staging', () => {
  const canonical = readFileSync(`worker-airtrust/migrations/${NAME}`, 'utf8');
  const adapted = adaptStagingMigrationSql({ migrationName: NAME, migrationSql: canonical });
  assert.match(adapted, /INSERT INTO qualificacoes_categorias/);
  assert.match(adapted, /SELECT 13,'EAD','EAD'/);
  assert.match(adapted, /INSERT INTO qualificacoes_formatos/);
  assert.match(adapted, /SELECT 1,'EAD','EAD'/);
  assert.match(adapted, /'CRM_CORP','CRM — Corporate'/);
  assert.match(adapted, /'D3','CRM — Tripulantes'/);
  assert.match(adapted, /SELECT 'TRI','Tripulação'/);
  assert.match(adapted, /'TERICO'/);
  assert.match(adapted, /'PRESENCIAL'/);
  assert.match(adapted, /'EMPRESA','OBRIGATORIA'/);
  assert.ok(adapted.endsWith(canonical));
  assert.equal(readFileSync('worker-airtrust/schema-v2/changes/0518_crm_qualification_consolidation.sql', 'utf8'), canonical);
});

test('staging adapter is a no-op for an unhandled migration', () => {
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
    CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,codigo TEXT,nome TEXT,descricao TEXT,categoria TEXT,carga_horaria REAL,carga_horaria_inicial REAL,carga_horaria_recorrente REAL,validade INTEGER,vencimento_fim_mes INTEGER,observacoes TEXT,ativo INTEGER,is_check INTEGER,formato_id INTEGER,categoria_id INTEGER,classe_requisito TEXT,dominio_codigo TEXT,area_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    CREATE TABLE qualificacoes_areas(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE setores(id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT NOT NULL,nome TEXT NOT NULL,descricao TEXT,responsavel TEXT,ativo INTEGER DEFAULT 1,created_at TEXT,updated_at TEXT,deleted_at TEXT,empresa_id INTEGER NOT NULL,dominio_codigo TEXT,centro_custo TEXT);
    CREATE TABLE treinamento_requisitos(id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,qualificacao_tipo_id INTEGER,escopo TEXT,obrigatoriedade TEXT,critico_operacional INTEGER,origem TEXT,observacoes TEXT,auto_matricular_ead INTEGER,ativo INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    INSERT INTO qualificacoes_categorias(id,nome,codigo,ativo,empresa_id,lms_integrada) VALUES(601,'Treinamentos Operacionais','TREINAMENTO_OPERACIONAL',1,6,0);
    INSERT INTO qualificacoes_areas(id,empresa_id,codigo,ativo,deleted_at) VALUES(1,6,'OPERACOES',1,NULL),(4,6,'SEGURANCA_OPERACIONAL',1,NULL);
    CREATE TRIGGER trg_qualification_type_category_fk_insert_0457 BEFORE INSERT ON qualificacoes_tipos WHEN NEW.deleted_at IS NULL BEGIN
      SELECT CASE WHEN NEW.categoria_id IS NULL OR NOT EXISTS (SELECT 1 FROM qualificacoes_categorias qc WHERE qc.id=NEW.categoria_id AND qc.empresa_id=NEW.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL) THEN RAISE(ABORT,'QUALIFICATION_CATEGORY_INVALID') END;
    END;
    CREATE TRIGGER trg_qualification_type_category_snapshot_insert_0457 AFTER INSERT ON qualificacoes_tipos WHEN NEW.deleted_at IS NULL BEGIN
      UPDATE qualificacoes_tipos SET categoria=(SELECT qc.nome FROM qualificacoes_categorias qc WHERE qc.id=NEW.categoria_id AND qc.empresa_id=NEW.empresa_id) WHERE id=NEW.id AND empresa_id=NEW.empresa_id;
    END;
  `;
  assert.equal(spawnSync('sqlite3', [db], { input: setup, encoding: 'utf8' }).status, 0);
  const before = spawnSync('sqlite3', [db], { input: "INSERT INTO qualificacoes_tipos(empresa_id,codigo,categoria,categoria_id,formato_id) VALUES(6,'CRM_DIR_RBAC119','EAD',(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),(SELECT id FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1));", encoding: 'utf8' });
  assert.notEqual(before.status, 0);
  assert.match(before.stderr, /QUALIFICATION_CATEGORY_INVALID/);
  assert.equal(spawnSync('sqlite3', [db], { input: bootstrap, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('sqlite3', [db, "SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_CORP' AND deleted_at IS NULL;"], { encoding: 'utf8' }).stdout.trim(), '1');
  assert.equal(spawnSync('sqlite3', [db, "SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='D3' AND deleted_at IS NULL;"], { encoding: 'utf8' }).stdout.trim(), '1');
  assert.equal(spawnSync('sqlite3', [db, "SELECT COUNT(*) FROM setores WHERE empresa_id=6 AND codigo='TRI' AND deleted_at IS NULL;"], { encoding: 'utf8' }).stdout.trim(), '1');
  assert.equal(spawnSync('sqlite3', [db, "SELECT COUNT(*) FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TERICO' AND deleted_at IS NULL;"], { encoding: 'utf8' }).stdout.trim(), '1');
  assert.equal(spawnSync('sqlite3', [db, "SELECT COUNT(*) FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='PRESENCIAL' AND deleted_at IS NULL;"], { encoding: 'utf8' }).stdout.trim(), '1');
  assert.equal(spawnSync('sqlite3', [db, "SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND escopo='EMPRESA' AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL;"], { encoding: 'utf8' }).stdout.trim(), '1');
  const after = spawnSync('sqlite3', [db], { input: "INSERT INTO qualificacoes_tipos(empresa_id,codigo,categoria,categoria_id,formato_id) VALUES(6,'CRM_DIR_RBAC119','EAD',(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),(SELECT id FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)); SELECT categoria||'|'||categoria_id||'|'||formato_id FROM qualificacoes_tipos WHERE codigo='CRM_DIR_RBAC119';", encoding: 'utf8' });
  assert.equal(after.status, 0, after.stderr);
  assert.equal(after.stdout.trim(), 'EAD|13|1');
});
