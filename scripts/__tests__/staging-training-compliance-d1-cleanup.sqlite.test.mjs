// source_reference: F1 cleanup real SQLite rollback with Schema V2 immutable triggers.
// dry_run_required: hermetic in-memory database, no Cloudflare access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';

const code='QA-COMP-LIFE-39349812345';
const marker='QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_39349812345';
const qa=999014, outsider=6;

function createDb() {
  const db=new DatabaseSync(':memory:');
  db.exec(`
  CREATE TABLE empresas(id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
  CREATE TABLE usuarios(id INTEGER,email TEXT,deleted_at TEXT,active INTEGER);
  CREATE TABLE usuarios_empresas(usuario_id INTEGER,empresa_id INTEGER,role TEXT);
  CREATE TABLE setores(id INTEGER,empresa_id INTEGER,codigo TEXT,descricao TEXT,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE setores_gestores(empresa_id INTEGER,usuario_id INTEGER,setor_id INTEGER,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE funcoes(id INTEGER,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE setores_funcoes(empresa_id INTEGER,setor_id INTEGER,funcao_id INTEGER,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE funcionarios(id INTEGER,empresa_id INTEGER,matricula TEXT,ativo INTEGER,status TEXT,deleted_at TEXT);
  CREATE TABLE qualificacoes_categorias(empresa_id INTEGER,codigo TEXT,descricao TEXT,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE qualificacoes_tipos(id INTEGER,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,titulo TEXT,observacoes TEXT,qualificacao_tipo_id INTEGER,ativo INTEGER,publicado INTEGER,deleted_at TEXT);
  CREATE TABLE lms_cursos_setores(empresa_id INTEGER,setor_id INTEGER,curso_id INTEGER,deleted_at TEXT);
  CREATE TABLE lms_matriculas(id INTEGER,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,status TEXT,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE lms_matricula_ciclos(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE lms_ciclo_evidencias(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,ciclo_id INTEGER,enrollment_json TEXT);
  CREATE TABLE lms_xapi_statements(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,archived_cycle_id INTEGER);
  CREATE TABLE qualificacoes_historico(id INTEGER,empresa_id INTEGER,funcionario_id INTEGER,qualificacao_id INTEGER,lms_matricula_id INTEGER,certificado_arquivo_id INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE documentos(id INTEGER,empresa_id INTEGER,funcionario_id INTEGER,r2_key TEXT,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE pasta_virtual(id INTEGER,empresa_id INTEGER,funcionario_id INTEGER,caminho_arquivo TEXT,deleted_at TEXT);
  CREATE TABLE treinamento_requisitos(empresa_id INTEGER,qualificacao_tipo_id INTEGER,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TABLE treinamento_matricula_reconciliacoes(empresa_id INTEGER,matricula_id INTEGER,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
  CREATE TRIGGER trg_lms_ciclo_evidencias_no_update BEFORE UPDATE ON lms_ciclo_evidencias BEGIN SELECT RAISE(ABORT,'LMS_CYCLE_EVIDENCE_IMMUTABLE'); END;
  CREATE TRIGGER trg_lms_ciclo_evidencias_no_delete BEFORE DELETE ON lms_ciclo_evidencias BEGIN SELECT RAISE(ABORT,'LMS_CYCLE_EVIDENCE_IMMUTABLE'); END;
  CREATE TRIGGER trg_lms_xapi_archived_no_delete BEFORE DELETE ON lms_xapi_statements WHEN OLD.archived_cycle_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'LMS_XAPI_HISTORICAL_IMMUTABLE'); END;
  INSERT INTO empresas VALUES (999014,'qa_examiner_training',1,NULL),(6,'real_tenant',1,NULL);
  INSERT INTO usuarios VALUES (1,'qa-examiner-admin@staging.airtrust.invalid',NULL,1);
  INSERT INTO usuarios_empresas VALUES(1,999014,'gestor');
  INSERT INTO setores VALUES(11,999014,'${code}-SEC','${marker}',1,NULL,NULL),(12,6,'REAL','real',1,NULL,NULL);
  INSERT INTO setores_gestores VALUES(999014,1,11,1,NULL,NULL);
  INSERT INTO funcoes VALUES(21,999014,'${code}-FUN',1,NULL,NULL),(22,6,'REAL',1,NULL,NULL);
  INSERT INTO setores_funcoes VALUES(999014,11,21,1,NULL,NULL);
  INSERT INTO funcionarios VALUES(201,999014,'${code}-E1',1,'ATIVO',NULL),(203,999014,'OTHER-QA',1,'ATIVO',NULL),(202,6,'REAL',1,'ATIVO',NULL);
  INSERT INTO qualificacoes_categorias VALUES(999014,'${code}-CAT','${marker}',1,NULL,NULL);
  INSERT INTO qualificacoes_tipos VALUES(101,999014,'${code}-REQ',1,NULL,NULL),(102,6,'REAL',1,NULL,NULL);
  INSERT INTO lms_cursos VALUES(301,999014,'${code} EAD obrigatório','${marker}',101,1,1,NULL),(302,6,'REAL','real',102,1,1,NULL),(303,999014,'OTHER-QA','other-qa',101,1,1,NULL);
  INSERT INTO lms_cursos_setores VALUES(999014,11,301,NULL);
  INSERT INTO lms_matriculas VALUES(401,999014,301,201,'CONCLUIDO',NULL,NULL),(402,6,302,202,'CONCLUIDO',NULL,NULL),(403,999014,303,203,'CONCLUIDO',NULL,NULL);
  INSERT INTO lms_matricula_ciclos VALUES(801,999014,401,0,NULL,NULL),(802,999014,401,1,NULL,NULL),(803,6,402,1,NULL,NULL);
  INSERT INTO lms_ciclo_evidencias VALUES(1001,999014,401,801,'historical qa'),(1002,6,402,803,'real');
  INSERT INTO lms_xapi_statements VALUES(901,999014,401,801),(902,999014,401,NULL),(903,6,402,803),(904,999014,403,NULL);
  INSERT INTO qualificacoes_historico VALUES(501,999014,201,101,401,601,NULL,NULL),(502,6,202,102,402,602,NULL,NULL),(503,999014,203,101,403,603,NULL,NULL);
  INSERT INTO documentos VALUES(601,999014,201,'qa-key',NULL,NULL),(602,6,202,'real-key',NULL,NULL),(603,999014,203,'other-qa-key',NULL,NULL);
  INSERT INTO pasta_virtual VALUES(701,999014,201,'qa-key',NULL),(702,6,202,'real-key',NULL),(703,999014,203,'other-qa-key',NULL);
  INSERT INTO treinamento_requisitos VALUES(999014,101,1,NULL,NULL),(6,102,1,NULL,NULL);
  INSERT INTO treinamento_matricula_reconciliacoes VALUES(999014,401,1,NULL,NULL),(6,402,1,NULL,NULL);
  `);
  return db;
}

function rollbackSql(){
 return execFileSync(process.execPath,[
   'scripts/staging/seed-qa-training-compliance-lifecycle.mjs',
   '--rollback','--print-sql-for-qa-test','--code='+code,'--marker='+marker
 ],{encoding:'utf8',env:{...process.env,NODE_ENV:'test',
 QA_EXAMINER_ADMIN_EMAIL:'qa-examiner-admin@staging.airtrust.invalid'}});
}

function execRollback(db,sql){
  for(const statement of sql.split(';\\n')){
    if (!statement.trim()) continue;
    try { db.exec(statement+';'); }
    catch(e){ throw Error('QA_ROLLBACK_SQL_FAILED:'+statement.trim().slice(0,90)+':'+e.message); }
  }
}

test('actual rollback SQL retires QA operational records, preserves audited archives, foreign tenant and other QA',()=>{
 const db=createDb();
 try {
  const sql=rollbackSql();
  execRollback(db,sql);
  const scalar=(query)=>db.prepare(query).get().n;
  assert.equal(scalar('SELECT COUNT(*) n FROM documentos WHERE id=601 AND deleted_at IS NULL'),0);
  assert.equal(scalar('SELECT COUNT(*) n FROM pasta_virtual WHERE id=701 AND deleted_at IS NULL'),0);
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_matricula_ciclos WHERE matricula_id=401 AND deleted_at IS NULL'),0);
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_xapi_statements WHERE id=902'),0);
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_xapi_statements WHERE id=901 AND archived_cycle_id=801'),1);
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_ciclo_evidencias WHERE id=1001 AND ciclo_id=801'),1);
  assert.equal(scalar('SELECT COUNT(*) n FROM qualificacoes_historico WHERE id=501 AND deleted_at IS NULL'),0);
  for (const id of [602,603]) {
    assert.equal(scalar('SELECT COUNT(*) n FROM documentos WHERE id='+id+' AND deleted_at IS NULL'),1);
  }
  for(const id of [702,703]) assert.equal(scalar('SELECT COUNT(*) n FROM pasta_virtual WHERE id='+id+' AND deleted_at IS NULL'),1);
  for(const id of [402,403]) assert.equal(scalar('SELECT COUNT(*) n FROM lms_matriculas WHERE id='+id+" AND status='CONCLUIDO'"),1);
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_ciclo_evidencias WHERE id=1002'),1);
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_xapi_statements WHERE id IN (903,904)'),2);
  execRollback(db,sql); // no new changes or violations on retry
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_xapi_statements WHERE id=901'),1);
  assert.equal(scalar('SELECT COUNT(*) n FROM lms_ciclo_evidencias WHERE id=1001'),1);
 } finally {db.close();}
});

test('failed SQL execution is transactional and never deletes immutable historical evidence',()=>{
 const db=createDb();
 try {
  const sql=rollbackSql();
  db.exec('BEGIN');
  assert.throws(()=>execRollback(db,sql);db.exec("DELETE FROM lms_ciclo_evidencias WHERE id=1001;"),/LMS_CYCLE_EVIDENCE_IMMUTABLE/);
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT deleted_at FROM documentos WHERE id=601').get().deleted_at,null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lms_xapi_statements').get().n,4);
 } finally {db.close();}
});
