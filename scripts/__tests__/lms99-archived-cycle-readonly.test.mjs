// source_reference: #1325 history recovery; disposable Node SQLite :memory: only.
// operational_decision: synthetic INSERTs test aggregate classification, not evidence of learner completion.
// dry_run_required: remote production query is SELECT-only and aggregated by course.
// rollback_plan_required: the in-memory DB is closed without any D1/R2 mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ARCHIVE_SQL,validateQuery,validateRows} from '../production/lms99-archived-cycle-readonly.mjs';

test('static archive query denies writes and stays tenant scoped',()=>{
 assert.equal(validateQuery(),ARCHIVE_SQL);
 assert.match(ARCHIVE_SQL,/m\.empresa_id=6/);
 assert.match(ARCHIVE_SQL,/cy\.ciclo_atual=0/);
 assert.match(ARCHIVE_SQL,/GROUP BY curso_id/);
 assert.throws(()=>validateQuery(ARCHIVE_SQL+' UPDATE lms_matriculas SET status=1'),/SQL_SCOPE/);
});
test('historical completed cycle and immutable SCORM snapshot are merely evidence leads',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(`CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,tipo_conteudo TEXT);
  CREATE TABLE lms_matriculas(id INTEGER,curso_id INTEGER,empresa_id INTEGER,status TEXT,progresso_pct REAL,deleted_at TEXT);
  CREATE TABLE lms_matricula_ciclos(id INTEGER,matricula_id INTEGER,empresa_id INTEGER,status TEXT,ciclo_atual INTEGER);
  CREATE TABLE lms_ciclo_evidencias(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,ciclo_id INTEGER,enrollment_json TEXT,scorm_json TEXT);`);
  db.exec(`INSERT INTO lms_cursos VALUES(43,6,'scorm'),(4,6,'scorm'),(43,7,'scorm');
  INSERT INTO lms_matriculas VALUES(100,43,6,'EM_ANDAMENTO',99,NULL),(101,4,6,'EM_ANDAMENTO',100,NULL),(102,43,7,'EM_ANDAMENTO',99,NULL);
  INSERT INTO lms_matricula_ciclos VALUES(200,100,6,'CONCLUIDO',0),(201,101,6,'EM_ANDAMENTO',1),(202,102,7,'CONCLUIDO',0);
  INSERT INTO lms_ciclo_evidencias VALUES(300,6,100,200,'{"status":"CONCLUIDO"}','{"lesson_status":"passed","score_raw":85}');`);
  const rows=validateRows(db.prepare(ARCHIVE_SQL).all());
  assert.deepEqual(rows.map(r=>r.curso_id),[4,43]);
  assert.equal(rows[0].pending_99,1);
  assert.equal(rows[0].archived_cycle_snapshot,0);
  assert.deepEqual({complete:rows[1].prior_completed_cycle,archived:rows[1].archived_cycle_snapshot,
   enrollment:rows[1].archived_enrollment_complete,terminal:rows[1].archived_scorm_terminal,
   numeric:rows[1].archived_numeric_score}, {complete:1,archived:1,enrollment:1,terminal:1,numeric:1});
 }finally{db.close();}
});
test('sanitized counts fail closed and protected workflow is read-only',()=>{
 const row={curso_id:43,pending_99:1,prior_completed_cycle:1,archived_cycle_snapshot:1,
 archived_enrollment_complete:1,archived_scorm_terminal:1,archived_numeric_score:1};
 assert.deepEqual(validateRows([row]),[row]);
 assert.throws(()=>validateRows([{...row,archived_scorm_terminal:2}]),/AGGREGATE_COUNT/);
 const workflow=readFileSync(new URL('../../.github/workflows/production-lms99-archived-cycle-readonly.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/verify-release-gates\.mjs/);
 assert.match(workflow,/CLOUDFLARE_D1_READONLY_API_TOKEN/);
 assert.doesNotMatch(workflow,/\bpush:|\bpull_request:/);
});
