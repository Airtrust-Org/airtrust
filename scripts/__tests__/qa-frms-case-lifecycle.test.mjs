import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TARGET,CONFIRM,seedSql,validTreatment,efficacy} from '../staging/qa-frms-case-lifecycle.mjs';

// source_reference: #1426; validate staging F0C DML against disposal SQLite.
// operational_decision: dedicated tenant and independent F0C IDs, preserve F0B cases.
// dry_run_required: only in-memory DatabaseSync, never remote D1.
// rollback_plan_required: database.close() discards all synthetic rows.
function fixture(tenant=999013){
  const db=new DatabaseSync(':memory:');
  db.exec([
    'CREATE TABLE empresas(id INTEGER PRIMARY KEY,codigo TEXT,ativo INTEGER,deleted_at TEXT)',
    'CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula TEXT,ativo INTEGER,deleted_at TEXT)',
    'CREATE TABLE frms_jornada(id TEXT PRIMARY KEY,tripulante_id INTEGER,data TEXT,status TEXT,hora_apresentacao TEXT,hora_termino TEXT,duracao_jornada_minutos INTEGER,horas_voo_minutos INTEGER,registrado_por TEXT,origem TEXT,observacao TEXT,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT)',
    'CREATE UNIQUE INDEX idx_frms_jornada_trip_data_uq ON frms_jornada(tripulante_id,data) WHERE deleted_at IS NULL',
    'CREATE TABLE frms_alerta(id TEXT PRIMARY KEY,tripulante_id INTEGER,jornada_id TEXT,tipo_limite TEXT,nivel TEXT,percentual_atingido INTEGER,valor_atual_min INTEGER,valor_limite_min INTEGER,mensagem TEXT,visualizado INTEGER,resolvido INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT)',
    "INSERT INTO empresas VALUES(999013,'qa_frms_ux_30d',1,NULL)",
    "INSERT INTO funcionarios VALUES(101,"+tenant+",'QA-FRMS-UX-01',1,NULL)",
    "INSERT INTO frms_alerta VALUES('qa-frms-f0b-case-1',101,'old-j', 'REPOUSO','CRITICO',112,500,480,'LEGACY F0B',0,0,'2026-11-04', '2026-11-04',NULL)",
  ].join(';')+';');
  return db;
}
test('only two new F0C rows, source SIGVOOS, F0B case byte-identical, idempotent seed',()=>{
  const db=fixture();
  const before=db.prepare("SELECT * FROM frms_alerta WHERE id='qa-frms-f0b-case-1'").get();
  db.exec(seedSql());
  const j=db.prepare('SELECT * FROM frms_jornada WHERE id=?').get(TARGET.journey);
  const a=db.prepare('SELECT * FROM frms_alerta WHERE id=?').get(TARGET.alert);
  assert.equal(j.data,TARGET.day);
  assert.equal(j.origem,'SIGVOOS');
  assert.equal(j.empresa_id,999013);
  assert.equal(a.jornada_id,TARGET.journey);
  assert.equal(a.tripulante_id,101);
  assert.equal(a.resolvido,0);
  assert.equal(a.visualizado,0);
  assert.deepEqual(db.prepare("SELECT * FROM frms_alerta WHERE id='qa-frms-f0b-case-1'").get(),before);
  db.exec(seedSql());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM frms_alerta WHERE id LIKE 'qa-frms-f0c-%'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM frms_jornada WHERE id LIKE 'qa-frms-f0c-%'").get().n,1);
  db.close();
});
test('wrong tenant cannot create either new row',()=>{
  const db=fixture(999014);
  db.exec(seedSql());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM frms_alerta WHERE id LIKE 'qa-frms-f0c-%'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM frms_jornada WHERE id LIKE 'qa-frms-f0c-%'").get().n,0);
  db.close();
});
test('fixed workflow and API payload cannot silently target another tenant or production',()=>{
  const sql=seedSql();
  assert.equal((sql.match(/INSERT INTO frms_jornada/g)||[]).length,1);
  assert.equal((sql.match(/INSERT INTO frms_alerta/g)||[]).length,1);
  assert.doesNotMatch(sql,/\bUPDATE\b|\bDELETE\b|qa-frms-ux-case-|qa-frms-f0b-case-/);
  assert.equal(TARGET.tenant,999013);
  assert.equal(TARGET.uuid,'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(TARGET.origin,'SIGVOOS');
  assert.equal(CONFIRM,'AIRTRUST_STAGING_FRMS_F0C_LIFECYCLE');
  assert(!Object.hasOwn(validTreatment(),'empresa_id'));
  assert(efficacy.length>=10);
});
