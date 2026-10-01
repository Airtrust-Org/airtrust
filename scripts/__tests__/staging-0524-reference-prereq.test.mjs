// source_reference: staging 0524 preflight 2026-09-30 + production tenant 6 maintenance reference catalog read-only comparison
// operational_decision: preserve immutable production Schema V2 0524 and bootstrap only non-PII maintenance reference prerequisites in staging
// dry_run_required: true
// rollback_plan_required: staging D1 Time Travel recovery point captured by apply-approved-migration-with-recovery-point.sh
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { adaptStagingMigrationSql } from '../staging/staging-migration-adapters.mjs';

const NAME = '0524_training_compliance_requirement_sanitization.sql';

test('0524 staging adapter adds only missing non-PII maintenance references', () => {
  const canonical = readFileSync(`worker-airtrust/migrations/${NAME}`, 'utf8');
  const adapted = adaptStagingMigrationSql({ migrationName: NAME, migrationSql: canonical });
  assert.match(adapted, /'MEC','Mecânico'/);
  assert.match(adapted, /'TREINAMENTO-DE-PRODUTO'/);
  assert.match(adapted, /'NAO_CLASSIFICADO'/);
  assert.match(adapted, /'MNT_AW139','AW139 - Manutenção'/);
  assert.match(adapted, /'MNT_S76AC','S-76 A\/C'/);
  assert.ok(adapted.endsWith(canonical));
  assert.equal(readFileSync('worker-airtrust/schema-v2/changes/0524_training_compliance_requirement_sanitization.sql', 'utf8'), canonical);
});

test('0524 staging bootstrap satisfies qualification category contract', () => {
  const canonical = readFileSync(`worker-airtrust/migrations/${NAME}`, 'utf8');
  const adapted = adaptStagingMigrationSql({ migrationName: NAME, migrationSql: canonical });
  const bootstrap = adapted.slice(0, adapted.length - canonical.length).trim();
  const db = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0524-staging-')), 'db.sqlite');
  const setup = `
CREATE TABLE qualificacoes_categorias(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,codigo TEXT,descricao TEXT,cor TEXT,ativo INTEGER,empresa_id INTEGER,dominio_codigo TEXT,lms_integrada INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
CREATE TABLE qualificacoes_formatos(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,codigo TEXT,descricao TEXT,cor TEXT,ativo INTEGER,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
CREATE TABLE funcoes(id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT,nome TEXT,descricao TEXT,categoria TEXT,ativo INTEGER,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
CREATE TABLE qualificacoes_areas(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT,nome TEXT,descricao TEXT,categoria TEXT,carga_horaria REAL,carga_horaria_inicial REAL,carga_horaria_recorrente REAL,validade INTEGER,vencimento_fim_mes INTEGER,observacoes TEXT,ativo INTEGER,is_check INTEGER,empresa_id INTEGER,formato_id INTEGER,categoria_id INTEGER,classe_requisito TEXT,dominio_codigo TEXT,area_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
INSERT INTO qualificacoes_categorias(id,nome,codigo,ativo,empresa_id,lms_integrada) VALUES(13,'EAD','EAD',1,6,1);
INSERT INTO qualificacoes_areas(id,empresa_id,codigo,ativo) VALUES(2,6,'MANUTENCAO',1);
INSERT INTO funcoes(codigo,nome,categoria,ativo,empresa_id) VALUES('ORG_AUX_MAN','Auxiliar de Manutenção','MANUTENCAO',1,6);
CREATE TRIGGER trg_category BEFORE INSERT ON qualificacoes_tipos WHEN NEW.deleted_at IS NULL BEGIN
 SELECT CASE WHEN NEW.categoria_id IS NULL OR NOT EXISTS(SELECT 1 FROM qualificacoes_categorias qc WHERE qc.id=NEW.categoria_id AND qc.empresa_id=NEW.empresa_id AND qc.ativo=1 AND qc.deleted_at IS NULL) THEN RAISE(ABORT,'QUALIFICATION_CATEGORY_INVALID') END;
END;`;
  assert.equal(spawnSync('sqlite3', [db], { input: setup, encoding: 'utf8' }).status, 0);
  const apply = spawnSync('sqlite3', [db], { input: bootstrap, encoding: 'utf8' });
  assert.equal(apply.status, 0, apply.stderr);
  const query = (sql) => spawnSync('sqlite3', [db, sql], { encoding: 'utf8' }).stdout.trim();
  assert.equal(query("SELECT COUNT(*) FROM funcoes WHERE empresa_id=6 AND codigo='MEC' AND nome='Mecânico';"), '1');
  assert.equal(query("SELECT COUNT(*) FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO-DE-PRODUTO';"), '1');
  assert.equal(query("SELECT COUNT(*) FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='NAO_CLASSIFICADO';"), '1');
  assert.equal(query("SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('MNT_AW139','MNT_S76AC') AND ativo=1;"), '2');
});
