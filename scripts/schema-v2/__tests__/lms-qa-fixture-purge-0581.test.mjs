// source_reference: AirTrust PR #2241 / Schema V2 0581 exact synthetic QA cleanup.
// operational_decision: IN_MEMORY_TEST_ONLY; no remote D1/R2 writes from this file.
// dry_run_required: Local node:sqlite fixture is ephemeral; real production preflight is mandatory.
// rollback_plan_required: Production executes only through governed Schema V2 with D1 Time Travel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const SQL=readFileSync(new URL('../../../worker-airtrust/schema-v2/changes/0581_lms_qa_fixture_hard_purge.sql',import.meta.url),'utf8');

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula TEXT,nome TEXT);
 CREATE TABLE usuarios(id INTEGER PRIMARY KEY,funcionario_id INTEGER REFERENCES funcionarios(id),email TEXT);
 CREATE TABLE usuarios_empresas(id INTEGER PRIMARY KEY,usuario_id INTEGER,empresa_id INTEGER);
 CREATE TABLE usuarios_empresas_perfis(id INTEGER PRIMARY KEY,usuario_id INTEGER,empresa_id INTEGER);
 CREATE TABLE convites_usuarios(id INTEGER PRIMARY KEY,usuario_id INTEGER,empresa_id INTEGER);
 CREATE TABLE refresh_tokens(id INTEGER PRIMARY KEY,user_id INTEGER);
 CREATE TABLE password_reset_tokens(id INTEGER PRIMARY KEY,user_id INTEGER);
 CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER REFERENCES funcionarios(id),qualificacao_historico_id INTEGER);
 CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,matricula_id INTEGER REFERENCES lms_matriculas(id),qualificacao_historico_id INTEGER);
 CREATE TABLE qualificacoes_historico(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,lms_matricula_id INTEGER REFERENCES lms_matriculas(id),lms_matricula_ciclo_id INTEGER REFERENCES lms_matricula_ciclos(id));
 CREATE TABLE lms_progresso_scorm(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER REFERENCES lms_matriculas(id));
 CREATE TABLE lms_xapi_statements(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER REFERENCES lms_matriculas(id));
 CREATE TABLE lms_pptx_slide_evidences(id INTEGER PRIMARY KEY,matricula_id INTEGER,funcionario_id INTEGER);
 CREATE TABLE lms_scorm_edition_handoffs(id INTEGER PRIMARY KEY,matricula_id INTEGER,ciclo_id INTEGER);
 CREATE TABLE notificacoes_log(id INTEGER PRIMARY KEY,funcionario_id INTEGER,qualificacao_historico_id INTEGER REFERENCES qualificacoes_historico(id));
 CREATE TABLE notificacoes_inapp(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER REFERENCES funcionarios(id));
 CREATE TABLE documentos(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER REFERENCES funcionarios(id));
 CREATE TABLE pasta_virtual(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER REFERENCES funcionarios(id));
 CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,user_id INTEGER);
 INSERT INTO funcionarios VALUES(194,6,'QA-LMS-CHR-202611','AIRTRUST_QA_LMS_CHR_202611');
 INSERT INTO funcionarios VALUES(195,6,'QA-LMS-WBK-202611','AIRTRUST_QA_LMS_WBK_202611');
 INSERT INTO funcionarios VALUES(30,6,'QA-LMS-202611','AIRTRUST_QA_LMS_E2E_202611');
 INSERT INTO funcionarios VALUES(40,6,'REAL-MATRICULA','REAL STAFF');
 INSERT INTO usuarios VALUES(162,194,'qa.lms.test@airtrust.online');
 INSERT INTO usuarios VALUES(163,195,'qa.lms.other@airtrust.online');
 INSERT INTO usuarios VALUES(31,30,'qa.lms.202611@airtrust.online');
 INSERT INTO usuarios VALUES(41,40,'staff@example.invalid');
 INSERT INTO usuarios_empresas VALUES(1,162,6);
 INSERT INTO usuarios_empresas VALUES(2,41,6);
 INSERT INTO usuarios_empresas_perfis VALUES(1,162,6);
 INSERT INTO convites_usuarios VALUES(1,162,6);
 INSERT INTO refresh_tokens VALUES(1,162);
 INSERT INTO refresh_tokens VALUES(2,41);
 INSERT INTO lms_matriculas(id,empresa_id,funcionario_id) VALUES(500,6,194),(501,6,195),(502,6,30),(503,6,40);
 INSERT INTO lms_matricula_ciclos(id,empresa_id,funcionario_id,matricula_id) VALUES(600,6,194,500),(601,6,40,503);
 INSERT INTO qualificacoes_historico VALUES(700,6,194,500,600),(701,6,40,503,601);
 UPDATE lms_matricula_ciclos SET qualificacao_historico_id=700 WHERE id=600;
 INSERT INTO lms_progresso_scorm VALUES(1,6,500),(2,6,503);
 INSERT INTO lms_xapi_statements VALUES(1,6,500),(2,6,503);
 INSERT INTO lms_pptx_slide_evidences VALUES(1,500,194),(2,503,40);
 INSERT INTO lms_scorm_edition_handoffs VALUES(1,500,600);
 INSERT INTO notificacoes_log VALUES(1,194,700),(2,40,701);
 INSERT INTO notificacoes_inapp VALUES(1,6,194),(2,6,40);
 INSERT INTO documentos VALUES(1,6,194),(2,6,40);
 INSERT INTO pasta_virtual VALUES(1,6,194),(2,6,40);
 INSERT INTO audit_logs VALUES(1,162);
 `);
 return db;
}
test('0581: remove synthetic QA graph, retain canonical, real user, real LMS and immutable audit',()=>{
 const db=fixture();
 db.exec(SQL);
 const ids=t=>db.prepare('SELECT id FROM '+t+' ORDER BY id').all().map(x=>x.id);
 assert.deepEqual(ids('funcionarios'),[30,40]);
 assert.deepEqual(ids('usuarios'),[31,41]);
 assert.deepEqual(ids('lms_matriculas'),[502,503]);
 assert.deepEqual(ids('qualificacoes_historico'),[701]);
 assert.deepEqual(ids('documentos'),[2]);
 assert.deepEqual(ids('refresh_tokens'),[2]);
 assert.deepEqual(ids('audit_logs'),[1]);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 db.close();
});
test('0581: same numeric ID cannot erase non-QA identity in a different tenant',()=>{
 const db=fixture();
 db.exec("UPDATE funcionarios SET empresa_id=7,matricula='EMP-195',nome='REAL PERSON' WHERE id=195");
 db.exec(SQL);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM funcionarios WHERE id=195').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE id=163').get().n,1);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 db.close();
});
