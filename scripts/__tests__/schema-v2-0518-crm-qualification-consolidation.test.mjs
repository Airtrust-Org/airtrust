import assert from 'node:assert/strict';
// source_reference: PCRM Rev.03 + Petrobras RPEA/PQ-C 2026 + production read-only inventory 2026-09-30
// operational_decision: consolidate non-crew CRM into CRM Corporate; preserve D3 for flight crew
// dry_run_required: true
// rollback_plan_required: worker-airtrust/schema-v2/plans/crm-qualification-consolidation-0518.md
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/crm-qualification-consolidation-0518.json';
const MIRROR = 'worker-airtrust/migrations/0518_crm_qualification_consolidation.sql';
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const runSql = (db, sql) => spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' });
const query = (db, sql) => { const r=spawnSync('sqlite3',['-noheader',db,sql],{encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return r.stdout.trim(); };

test('0518 manifest pins canonical SQL and plan, with identical migration mirror', () => {
  const m=JSON.parse(readFileSync(MANIFEST,'utf8'));
  assert.equal(m.changeId,'crm-qualification-consolidation-0518');
  assert.equal(sha256(readFileSync(m.filePath)),m.fileHash);
  assert.equal(sha256(readFileSync(m.planPath)),m.planHash);
  assert.equal(readFileSync(m.filePath,'utf8'),readFileSync(MIRROR,'utf8'));
});

test('0518 retires LOS and maintenance duplicate while preserving history evidence under CRM Corporate', () => {
  const m=JSON.parse(readFileSync(MANIFEST,'utf8')); const sql=readFileSync(m.filePath,'utf8');
  const db=path.join(mkdtempSync(path.join(tmpdir(),'airtrust-0518-')),'db.sqlite');
  const setup=`
    CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,nome TEXT,descricao TEXT,observacoes TEXT,categoria TEXT,carga_horaria REAL,carga_horaria_inicial REAL,carga_horaria_recorrente REAL,conteudo_programatico TEXT,validade INTEGER,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
    CREATE TABLE setores(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos_setores(id INTEGER PRIMARY KEY AUTOINCREMENT,tipo_id INTEGER,setor_id INTEGER,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    CREATE UNIQUE INDEX idx_qts_unique_active ON qualificacoes_tipos_setores(tipo_id,setor_id,empresa_id) WHERE deleted_at IS NULL;
    CREATE TABLE qualificacoes_historico(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,qualificacao_id INTEGER,qualificacao_codigo TEXT,tipo TEXT,carga_horaria REAL,data_conclusao TEXT,data_vencimento TEXT,deleted_at TEXT,updated_at TEXT);
    CREATE TRIGGER trg_qh_tipo AFTER UPDATE OF qualificacao_id ON qualificacoes_historico BEGIN UPDATE qualificacoes_historico SET tipo=(SELECT nome FROM qualificacoes_tipos WHERE id=NEW.qualificacao_id) WHERE id=NEW.id; END;
    CREATE TABLE treinamento_requisitos(id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER,escopo TEXT,setor_id INTEGER,funcao_id INTEGER,funcionario_id INTEGER,obrigatoriedade TEXT,critico_operacional INTEGER,origem TEXT,observacoes TEXT,auto_matricular_ead INTEGER,ativo INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    CREATE TABLE treinamentos_planejados(id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER,titulo TEXT,updated_at TEXT);
    INSERT INTO qualificacoes_tipos VALUES
      (24,6,'D3','CRM — Tripulantes',NULL,NULL,'Teórico',8,16,8,NULL,12,1,NULL,NULL),
      (99,6,'CRM-LOS-T','CRM em Ambiente LOS — Teórico',NULL,NULL,'Teórico',4,4,4,NULL,12,1,NULL,NULL),
      (100,6,'CRM-LOS-P','CRM em Ambiente LOS — Prático',NULL,NULL,'Prático',4,4,4,NULL,12,1,NULL,NULL),
      (136,6,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',NULL,NULL,'Técnico',4,8,4,NULL,24,1,NULL,NULL),
      (187,6,'CRM_CORP','CRM — Corporativo',NULL,NULL,'Teórico',8,16,8,NULL,24,1,NULL,NULL);
    INSERT INTO setores VALUES (10,6,'TRI',1,NULL),(11,6,'MAN',1,NULL),(14,6,'ADM',1,NULL),(31,6,'LOG',0,NULL);
    INSERT INTO qualificacoes_tipos_setores(tipo_id,setor_id,empresa_id) VALUES (99,10,6),(100,10,6),(136,11,6);
    INSERT INTO qualificacoes_historico VALUES
      (1,6,10,136,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',4,'2025-01-10','2027-01-10',NULL,NULL),
      (2,6,11,136,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',8,'2024-03-02','2026-03-02','2026-01-01',NULL),
      (3,6,12,187,'CRM_CORP','CRM — Corporativo',16,'2025-05-01','2027-05-01',NULL,NULL);
    INSERT INTO treinamento_requisitos VALUES (1,6,99,'FUNCAO',NULL,17,NULL,'OBRIGATORIA',0,'PTO',NULL,0,1,NULL,NULL,NULL),(2,6,100,'FUNCAO',NULL,17,NULL,'OBRIGATORIA',0,'PTO',NULL,0,1,NULL,NULL,NULL),(3,6,136,'FUNCAO',NULL,5,NULL,'OBRIGATORIA',0,'EMPRESA',NULL,0,1,NULL,NULL,NULL),(4,6,187,'EMPRESA',NULL,NULL,NULL,'OBRIGATORIA',0,'EMPRESA',NULL,0,1,NULL,NULL,NULL);
    INSERT INTO treinamentos_planejados VALUES (25,6,136,'CRM — Company Resource Management',NULL);
  `;
  assert.equal(runSql(db,setup).status,0);
  const applied=runSql(db,sql); assert.equal(applied.status,0,applied.stderr);
  assert.equal(query(db,"SELECT nome||'|'||validade||'|'||carga_horaria_inicial||'|'||carga_horaria_recorrente FROM qualificacoes_tipos WHERE codigo='CRM_CORP' AND deleted_at IS NULL"),'CRM Corporate|24|16.0|16.0');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_tipos WHERE codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM') AND deleted_at IS NULL"),'0');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_tipos WHERE codigo='D3' AND deleted_at IS NULL"),'1');
  assert.equal(query(db,'SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id=136'),'0');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id=187 AND qualificacao_codigo='CRM_CORP'"),'3');
  assert.equal(query(db,'SELECT carga_horaria||"|"||data_conclusao||"|"||data_vencimento FROM qualificacoes_historico WHERE id=1'),'4.0|2025-01-10|2027-01-10');
  assert.equal(query(db,'SELECT COUNT(*) FROM treinamento_requisitos WHERE ativo=1 AND deleted_at IS NULL'),'2');
  assert.equal(query(db,"SELECT COUNT(*) FROM treinamento_requisitos WHERE qualificacao_tipo_id=187 AND escopo='SETOR' AND setor_id=10 AND obrigatoriedade='NAO_APLICA' AND ativo=1 AND deleted_at IS NULL"),'1');
  assert.equal(query(db,"SELECT qualificacao_tipo_id||'|'||titulo FROM treinamentos_planejados WHERE id=25"),'187|CRM Corporate');
  assert.equal(query(db,'SELECT COUNT(*) FROM qualificacoes_tipos_setores WHERE tipo_id=187 AND deleted_at IS NULL'),'3');
  assert.equal(query(db,'SELECT COUNT(*) FROM qualificacoes_tipos_setores WHERE tipo_id IN (99,100,136) AND deleted_at IS NULL'),'0');
});

test('Schema V2 builder accepts 0518 and appends one ledger row', () => {
  const out=path.join(mkdtempSync(path.join(tmpdir(),'airtrust-0518-bundle-')),'apply.sql');
  const r=buildReviewedSchemaApply({manifestPath:MANIFEST,outputPath:out,expectedChangeId:'crm-qualification-consolidation-0518',githubSha:'d'.repeat(40)});
  assert.equal(r.changeId,'crm-qualification-consolidation-0518');
  assert.equal((readFileSync(out,'utf8').match(/INSERT INTO airtrust_schema_changes_v2/g)??[]).length,1);
});

test('0518 is wired into staging and production governed paths', () => {
  const outer=readFileSync('scripts/staging/apply-approved-migrations.sh','utf8');
  const recovery=readFileSync('scripts/staging/apply-approved-migration-with-recovery-point.sh','utf8');
  const workflow=readFileSync('.github/workflows/apply-schema-change-v2.yml','utf8');
  assert.match(outer,/0518_crm_qualification_consolidation\.sql/);
  assert.match(recovery,/validate-0518-postconditions\.sh/);
  assert.match(workflow,/crm-qualification-consolidation-0518/);
  for (const file of ['scripts/schema-v2/validate-0518-production-preflight.sh','scripts/schema-v2/validate-0518-production-postconditions.sh','scripts/staging/validate-0518-postconditions.sh']) assert.equal(spawnSync('bash',['-n',file]).status,0);
});
