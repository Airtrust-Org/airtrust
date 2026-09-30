import assert from 'node:assert/strict';
// source_reference: ANAC IS 00-010B + PCRM Rev.03 + IOGP/Petrobras RPEA/PQ-C 2026 + production read-only inventory 2026-09-30
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
    CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,nome TEXT,descricao TEXT,observacoes TEXT,categoria TEXT,carga_horaria REAL,carga_horaria_inicial REAL,carga_horaria_recorrente REAL,conteudo_programatico TEXT,validade INTEGER,ativo INTEGER,deleted_at TEXT,updated_at TEXT,vencimento_fim_mes INTEGER DEFAULT 0,is_check INTEGER DEFAULT 0,formato_id INTEGER,categoria_id INTEGER,classe_requisito TEXT,dominio_codigo TEXT,area_id INTEGER,created_at TEXT);
    CREATE TABLE qualificacoes_formatos(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE qualificacoes_categorias(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE qualificacoes_areas(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE setores(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos_setores(id INTEGER PRIMARY KEY AUTOINCREMENT,tipo_id INTEGER,setor_id INTEGER,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    CREATE UNIQUE INDEX idx_qts_unique_active ON qualificacoes_tipos_setores(tipo_id,setor_id,empresa_id) WHERE deleted_at IS NULL;
    CREATE TABLE qualificacoes_historico(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,qualificacao_id INTEGER,qualificacao_codigo TEXT,tipo TEXT,carga_horaria REAL,data_conclusao TEXT,data_vencimento TEXT,status TEXT,certificado_arquivo_id INTEGER,numero_certificado TEXT,renovacao_de INTEGER,renovada INTEGER DEFAULT 0,created_at TEXT,deleted_at TEXT,updated_at TEXT);
    CREATE TRIGGER trg_qh_tipo AFTER UPDATE OF qualificacao_id ON qualificacoes_historico BEGIN UPDATE qualificacoes_historico SET tipo=(SELECT nome FROM qualificacoes_tipos WHERE id=NEW.qualificacao_id) WHERE id=NEW.id; END;
    CREATE TABLE treinamento_requisitos(id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER,escopo TEXT,setor_id INTEGER,funcao_id INTEGER,funcionario_id INTEGER,obrigatoriedade TEXT,critico_operacional INTEGER,origem TEXT,observacoes TEXT,auto_matricular_ead INTEGER,ativo INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
    CREATE TABLE treinamentos_planejados(id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER,titulo TEXT,updated_at TEXT);
    INSERT INTO qualificacoes_tipos(id,empresa_id,codigo,nome,descricao,observacoes,categoria,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,conteudo_programatico,validade,ativo,deleted_at,updated_at) VALUES
      (24,6,'D3','CRM — Tripulantes',NULL,NULL,'Teórico',8,16,8,NULL,12,1,NULL,NULL),
      (99,6,'CRM-LOS-T','CRM em Ambiente LOS — Teórico',NULL,NULL,'Teórico',4,4,4,NULL,12,1,NULL,NULL),
      (100,6,'CRM-LOS-P','CRM em Ambiente LOS — Prático',NULL,NULL,'Prático',4,4,4,NULL,12,1,NULL,NULL),
      (136,6,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',NULL,NULL,'Técnico',4,8,4,NULL,24,1,NULL,NULL),
      (187,6,'CRM_CORP','CRM — Corporativo',NULL,NULL,'Teórico',8,16,8,NULL,24,1,NULL,NULL);
    INSERT INTO qualificacoes_formatos VALUES (1,6,'EAD',1,NULL),(3,6,'PRESENCIAL',1,NULL);
    INSERT INTO qualificacoes_categorias VALUES (3,6,'TERICO',1,NULL),(13,6,'EAD',1,NULL);
    INSERT INTO qualificacoes_areas VALUES (1,6,'OPERACOES',1,NULL),(4,6,'SEGURANCA_OPERACIONAL',1,NULL);
    INSERT INTO setores VALUES (10,6,'TRI',1,NULL),(11,6,'MAN',1,NULL),(14,6,'ADM',1,NULL),(31,6,'LOG',0,NULL);
    INSERT INTO qualificacoes_tipos_setores(tipo_id,setor_id,empresa_id) VALUES (99,10,6),(100,10,6),(136,11,6);
    INSERT INTO qualificacoes_historico VALUES
      (1,6,10,136,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',4,'2025-01-10','2027-01-10','CONCLUIDO',NULL,NULL,NULL,0,'2025-01-10 12:00:00',NULL,NULL),
      (2,6,11,136,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',8,'2024-03-02','2026-03-02','CONCLUIDO',NULL,NULL,NULL,0,'2024-03-02 12:00:00','2026-01-01',NULL),
      (3,6,12,187,'CRM_CORP','CRM — Corporativo',16,'2025-05-01','2027-05-01','CONCLUIDA',NULL,NULL,NULL,0,'2025-05-01 12:00:00',NULL,NULL),
      -- Same employee/date: legacy maintenance row has the certificate and must survive.
      (4,6,13,136,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',4,'2026-05-16','2028-05-16','CONCLUIDO',900,'CERT-LEGACY',NULL,0,'2026-06-30 10:00:00',NULL,NULL),
      (5,6,13,187,'CRM_CORP','CRM — Corporativo',16,'2026-05-16','2028-05-16','CONCLUIDA',NULL,NULL,NULL,0,'2026-09-28 10:00:00',NULL,NULL),
      -- Same employee/date inside the maintenance model: RENOVADA copy is redundant.
      (6,6,14,136,NULL,'Fatores Humanos / CRM Manutenção',NULL,'2025-10-29','2027-10-29','RENOVADA',NULL,NULL,NULL,1,'2026-06-30 10:00:00',NULL,NULL),
      (7,6,14,136,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',NULL,'2025-10-29','2027-10-29','CONCLUIDO',NULL,NULL,NULL,0,'2026-06-30 10:00:00',NULL,NULL),
      -- Later completion points at duplicate id=6 and must be repointed to survivor id=7.
      (8,6,14,136,'MNT_FATORES_HUMANOS_CRM','Fatores Humanos / CRM Manutenção',4,'2026-10-29','2028-10-29','CONCLUIDO',NULL,NULL,6,0,'2026-10-29 10:00:00',NULL,NULL);
    INSERT INTO treinamento_requisitos VALUES (1,6,99,'FUNCAO',NULL,17,NULL,'OBRIGATORIA',0,'PTO',NULL,0,1,NULL,NULL,NULL),(2,6,100,'FUNCAO',NULL,17,NULL,'OBRIGATORIA',0,'PTO',NULL,0,1,NULL,NULL,NULL),(3,6,136,'FUNCAO',NULL,5,NULL,'OBRIGATORIA',0,'EMPRESA',NULL,0,1,NULL,NULL,NULL),(4,6,187,'EMPRESA',NULL,NULL,NULL,'OBRIGATORIA',0,'EMPRESA',NULL,0,1,NULL,NULL,NULL);
    INSERT INTO treinamentos_planejados VALUES (25,6,136,'CRM — Company Resource Management',NULL);
  `;
  assert.equal(runSql(db,setup).status,0);
  const applied=runSql(db,sql); assert.equal(applied.status,0,applied.stderr);
  assert.equal(query(db,"SELECT nome||'|'||validade||'|'||carga_horaria_inicial||'|'||carga_horaria_recorrente FROM qualificacoes_tipos WHERE codigo='CRM_CORP' AND deleted_at IS NULL"),'CRM Corporate|24|16.0|16.0');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_tipos WHERE codigo='CRM_CORP' AND conteudo_programatico LIKE '%IS 00-010B item 5.3.2.2%' AND conteudo_programatico LIKE '%16 horas presenciais a cada 24 meses%'"),'1');
  assert.equal(query(db,"SELECT nome||'|'||categoria||'|'||carga_horaria||'|'||carga_horaria_inicial||'|'||COALESCE(carga_horaria_recorrente,'NULL')||'|'||COALESCE(validade,'NULL')||'|'||formato_id||'|'||categoria_id||'|'||classe_requisito||'|'||dominio_codigo||'|'||area_id FROM qualificacoes_tipos WHERE codigo='CRM_DIR_RBAC119' AND deleted_at IS NULL"),'CRM para Gestores — Cargos de Direção Requeridos (RBAC 119)|EAD|4.0|4.0|NULL|NULL|1|13|TREINAMENTO|CORPORATIVO|4');
  assert.equal(query(db,"SELECT COUNT(*) FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE qt.codigo='CRM_DIR_RBAC119' AND tr.ativo=1 AND tr.deleted_at IS NULL"),'0');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_tipos WHERE codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM') AND deleted_at IS NULL"),'0');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_tipos WHERE codigo='D3' AND deleted_at IS NULL"),'1');
  assert.equal(query(db,'SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id=136 AND deleted_at IS NULL'),'0');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id=187 AND qualificacao_codigo='CRM_CORP' AND deleted_at IS NULL"),'5');
  assert.equal(query(db,'SELECT carga_horaria||"|"||data_conclusao||"|"||data_vencimento FROM qualificacoes_historico WHERE id=1'),'4.0|2025-01-10|2027-01-10');
  assert.equal(query(db,"SELECT id||'|'||qualificacao_id||'|'||carga_horaria||'|'||certificado_arquivo_id FROM qualificacoes_historico WHERE funcionario_id=13 AND data_conclusao='2026-05-16' AND deleted_at IS NULL"),'4|187|4.0|900');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_historico WHERE id=5 AND deleted_at IS NOT NULL"),'1');
  assert.equal(query(db,"SELECT id FROM qualificacoes_historico WHERE funcionario_id=14 AND data_conclusao='2025-10-29' AND deleted_at IS NULL"),'7');
  assert.equal(query(db,'SELECT renovacao_de FROM qualificacoes_historico WHERE id=8'),'7');
  assert.equal(query(db,"SELECT COUNT(*) FROM (SELECT funcionario_id,data_conclusao FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=187 AND deleted_at IS NULL GROUP BY funcionario_id,data_conclusao HAVING COUNT(*)>1)"),'0');
  assert.equal(query(db,'SELECT COUNT(*) FROM treinamento_requisitos WHERE ativo=1 AND deleted_at IS NULL'),'2');
  assert.equal(query(db,"SELECT COUNT(*) FROM treinamento_requisitos WHERE qualificacao_tipo_id=187 AND escopo='SETOR' AND setor_id=10 AND obrigatoriedade='NAO_APLICA' AND ativo=1 AND deleted_at IS NULL"),'1');
  assert.equal(query(db,"SELECT qualificacao_tipo_id||'|'||titulo FROM treinamentos_planejados WHERE id=25"),'187|CRM Corporate');
  assert.equal(query(db,'SELECT COUNT(*) FROM qualificacoes_tipos_setores WHERE tipo_id=187 AND deleted_at IS NULL'),'3');
  assert.equal(query(db,"SELECT COUNT(*) FROM qualificacoes_tipos_setores qts JOIN qualificacoes_tipos qt ON qt.id=qts.tipo_id WHERE qt.codigo='CRM_DIR_RBAC119' AND qts.deleted_at IS NULL"),'3');
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
