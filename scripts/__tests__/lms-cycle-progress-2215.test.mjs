// source_reference: issue #2215 (production tenant6 targeted D1 readback 2026-11-13), PR #2253.
// operational_decision: repair cycles #2671/#2305 only; preserve #508=100%, all CMI, score and qualifications.
// dry_run_required: immutable same-SHA reviewed artifact and prestate SHA256 before any apply.
// rollback_plan_required: official D1 Time Travel checkpoint; stop on drift and recover under governance.
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCOPE,validateBefore,validateAfter,checkChangedIds,UPDATE,AUDIT} from '../production/lms-cycle-progress-2215.mjs';

const rows=[
 {m:385,tenant:6,course:34,c:508,ms:'EM_ANDAMENTO',mp:58,mi:'2026-06-30 16:12:59',cs:'EM_ANDAMENTO',cp:100,ci:'2026-06-30 16:12:59',score:100,tries:3,qual:null},
 {m:1390,tenant:6,course:22,c:2671,ms:'EM_ANDAMENTO',mp:2,mi:'2026-11-13 01:43:21',cs:'NAO_INICIADO',cp:0,ci:null,score:null,tries:0,qual:null},
 {m:2057,tenant:6,course:68,c:2305,ms:'EM_ANDAMENTO',mp:5,mi:'2026-10-16 15:08:46',cs:'EM_ANDAMENTO',cp:2,ci:'2026-10-16 15:08:46',score:0,tries:1,qual:null},
];
function copy(){return structuredClone(rows);}
test('scope contains only tenant6 three known cycles',()=>{
 assert.match(SCOPE,/TENANT6/);
 assert.equal(validateBefore(copy()).length,64);
 for(const index of [0,1,2]){
  const altered=copy();altered[index].tenant=7;
  assert.throws(()=>validateBefore(altered),/CYCLE2215_PRESTATE_DRIFT/);
 }
});
test('reject prestate drift, enrollment status changed or missing starts',()=>{
 for(const change of [
  a=>a[0].cp=99,a=>a[1].mp=5,a=>a[2].cs='CONCLUIDO',
  a=>a[1].mi=null,a=>a.pop(),
 ]){
  const altered=copy();change(altered);
  assert.throws(()=>validateBefore(altered));
 }
});
test('accept exact monotonic reconciliation while retaining score, attempts and history',()=>{
 const before=copy(),after=copy();
 after[1].cp=2;after[1].cs='EM_ANDAMENTO';after[1].ci=before[1].mi;
 after[2].cp=5;
 validateAfter(after,before);
 assert.equal(after[0].cp,100);
});
test('never downgrade SCORM cycle 508 or forge completed state',()=>{
 const before=copy(),after=copy();
 after[1].cp=2;after[1].cs='EM_ANDAMENTO';
 after[2].cp=5;
 after[0].cp=58;
 assert.throws(()=>validateAfter(after,before));
 after[0].cp=100;after[0].cs='CONCLUIDO';
 assert.throws(()=>validateAfter(after,before));
});
test('reject unscoped or partial D1 writes',()=>{
 checkChangedIds([{id:2671},{id:2305}]);
 for(const bad of [[{id:2671}],[{id:2671},{id:9999}],[]])
  assert.throws(()=>checkChangedIds(bad));
});

function physical(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,status TEXT,progresso_pct INTEGER,data_inicio TEXT,deleted_at TEXT);");
 db.exec("CREATE TABLE lms_matricula_ciclos (id INTEGER PRIMARY KEY,matricula_id INTEGER,empresa_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT,status TEXT,progresso_pct INTEGER,data_inicio TEXT,score_final INTEGER,tentativas INTEGER,qualificacao_historico_id INTEGER,updated_at TEXT);");
 db.exec("CREATE TABLE audit_logs (id INTEGER PRIMARY KEY,action TEXT,entity_type TEXT,entity_id INTEGER,empresa_id INTEGER,old_values TEXT,new_values TEXT,detalhes TEXT,created_at TEXT,deleted_at TEXT);");
 db.exec("INSERT INTO lms_matriculas VALUES (385,6,34,'EM_ANDAMENTO',58,'2026-06-30',NULL),(1390,6,22,'EM_ANDAMENTO',2,'2026-11-13',NULL),(2057,6,68,'EM_ANDAMENTO',5,'2026-10-16',NULL);");
 db.exec("INSERT INTO lms_matricula_ciclos VALUES (508,385,6,1,NULL,'EM_ANDAMENTO',100,'2026-06-30',100,3,789,NULL),(2671,1390,6,1,NULL,'NAO_INICIADO',0,NULL,NULL,0,NULL,NULL),(2305,2057,6,1,NULL,'EM_ANDAMENTO',2,'2026-10-16',0,1,NULL,NULL);");
 return db;
}
test('physical SQLite applies exactly two rows and audits both, without changing 100 percent SCORM cycle',()=>{
 const db=physical();
 try {
  const changed=db.prepare(UPDATE).all();
  checkChangedIds(changed);
  const audited=db.prepare(AUDIT).all().map(v=>({id:v.entity_id}));
  checkChangedIds(audited);
  const rows=db.prepare('SELECT id,status,progresso_pct,data_inicio,score_final,tentativas,qualificacao_historico_id FROM lms_matricula_ciclos ORDER BY id').all();
  assert.deepEqual(rows.map(r=>[r.id,r.status,r.progresso_pct]),[
   [508,'EM_ANDAMENTO',100],[2305,'EM_ANDAMENTO',5],[2671,'EM_ANDAMENTO',2],
  ]);
  assert.equal(rows[0].qualificacao_historico_id,789);
  assert.equal(rows[0].score_final,100);
  assert.equal(rows[0].tentativas,3);
  assert.equal(rows[1].score_final,0);
  assert.equal(rows[2].data_inicio,'2026-11-13');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,2);
 } finally {db.close();}
});
test('physical SQL fail-closes ALL writes when one of two preconditions changes',()=>{
 const db=physical();
 try {
  db.exec('UPDATE lms_matricula_ciclos SET progresso_pct=3 WHERE id=2305');
  assert.deepEqual(db.prepare(UPDATE).all(),[]);
  assert.equal(db.prepare('SELECT progresso_pct pct FROM lms_matricula_ciclos WHERE id=2671').get().pct,0);
  assert.equal(db.prepare('SELECT progresso_pct pct FROM lms_matricula_ciclos WHERE id=508').get().pct,100);
 } finally {db.close();}
});
