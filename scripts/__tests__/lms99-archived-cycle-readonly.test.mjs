// source_reference: #1325 history recovery; disposable Node SQLite :memory: only.
// operational_decision: synthetic INSERTs test aggregate classification, not evidence of learner completion.
// dry_run_required: remote production query is SELECT-only and aggregated by course.
// rollback_plan_required: the in-memory DB is closed without any D1/R2 mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ARCHIVE_SQL,SCHEMA_PROBE_SQL,PRODUCTION_D1_ID,NON_PRODUCTION_D1_IDS,assertSqlTransportScope,d1,validateSchemaRows,validateQuery,validateRows,classifyD1Failure,classifyD1RestRejection,safePublicError} from '../production/lms99-archived-cycle-readonly.mjs';

test('D1 REST transport is pinned to production database and reviewed SELECT statements',async()=>{
 assert.equal(PRODUCTION_D1_ID,'7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae');
 for(const id of NON_PRODUCTION_D1_IDS)
  assert.throws(()=>assertSqlTransportScope(SCHEMA_PROBE_SQL,id),/D1_TARGET_DENIED/);
 assert.throws(()=>assertSqlTransportScope('UPDATE lms_matriculas SET status=1'),/SQL_NOT_REVIEWED/);
 let seen=null;
 const mockFetch=async(url,options)=>{
  seen={url,method:options.method,sql:JSON.parse(options.body).sql};
  return {ok:true,json:async()=>({success:true,result:[{success:true,results:[
   {check_name:'lms_matriculas',present:1},{check_name:'lms_cursos',present:1},
   {check_name:'lms_matricula_ciclos',present:1},{check_name:'lms_ciclo_evidencias',present:1},
   {check_name:'lms_ciclo_evidencias.scorm_json',present:1},
   {check_name:'lms_ciclo_evidencias.enrollment_json',present:1},
   {check_name:'lms_matricula_ciclos.ciclo_atual',present:1},
   {check_name:'lms_matriculas.progresso_pct',present:1}]}]})};
 };
 const rows=await d1(SCHEMA_PROBE_SQL,{fetcher:mockFetch,accountId:'test-account',token:'not-a-secret'});
 assert.equal(rows.length,8);
 assert.equal(seen.method,'POST');
 assert.match(seen.url,/\/d1\/database\/7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae\/query$/);
 assert.equal(seen.sql,SCHEMA_PROBE_SQL);
 await assert.rejects(d1(SCHEMA_PROBE_SQL,{fetcher:async()=>({ok:false,json:async()=>({errors:[{message:'SECRET_SHOULD_NOT_LOG'}]})}),accountId:'test-account',token:'test'}),/D1_READ_REJECTED/);
});

test('D1 rejection is classified without leaking token, SQL or provider messages',()=>{
 assert.equal(classifyD1RestRejection(403,{errors:[{code:9109,message:'forbidden token=LEAK'}]}),'D1_ACCESS_DENIED');
 assert.equal(classifyD1RestRejection(400,{errors:[{code:7500,message:'D1_ERROR: no such table: lms_ciclo_evidencias'}]}),'D1_SCHEMA_TABLE_MISSING');
 assert.equal(classifyD1RestRejection(400,{errors:[{code:7500,message:'no such column: cy.ciclo_atual'}]}),'D1_SCHEMA_COLUMN_MISSING');
 assert.equal(classifyD1RestRejection(400,{errors:[{code:7500,message:'near \"UNION\": syntax error'}]}),'D1_SQL_SYNTAX_REJECTED');
 assert.equal(classifyD1RestRejection(429,{errors:[]}), 'D1_RATE_LIMITED');
 assert.equal(classifyD1RestRejection(500,{errors:[{code:7500,message:'private detail'}]}),'D1_CF_CODE_7500');
 assert.equal(classifyD1RestRejection(502,{errors:[{message:'sensitive'}]}),'D1_HTTP_502');
 assert.equal(safePublicError(new Error('LMS99_HISTORY_D1_CF_CODE_7500')),'LMS99_HISTORY_D1_CF_CODE_7500');
});

test('protected schema probe reports only fixed table and column availability',()=>{
 assert.match(SCHEMA_PROBE_SQL,/^SELECT 'lms_matriculas'/);
 assert.doesNotMatch(SCHEMA_PROBE_SQL,/\bINSERT|\bUPDATE|\bDELETE/i);
 const labels=['lms_matriculas','lms_cursos','lms_matricula_ciclos','lms_ciclo_evidencias',
  'lms_ciclo_evidencias.scorm_json','lms_ciclo_evidencias.enrollment_json',
  'lms_matricula_ciclos.ciclo_atual','lms_matriculas.progresso_pct'];
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE lms_matriculas(id INTEGER, progresso_pct INTEGER); CREATE TABLE lms_cursos(id INTEGER);');
  const rows=validateSchemaRows(db.prepare(SCHEMA_PROBE_SQL).all());
  assert.deepEqual(rows.map(r=>r.check_name),labels);
  assert.deepEqual(rows.map(r=>r.present),[1,1,0,0,0,0,0,1]);
  assert.throws(()=>validateSchemaRows([{check_name:'private',present:1}]),/SCHEMA_ROW_COUNT/);
 }finally{db.close();}
});

test('failures expose only fixed diagnostic categories, never provider messages',()=>{
 assert.equal(classifyD1Failure('D1 error: no such table: lms_ciclo_evidencias'),'D1_ARCHIVE_SCHEMA_MISSING');
 assert.equal(classifyD1Failure('SQLITE_ERROR: no such column: discarded_state'),'D1_COLUMN_SCHEMA_MISMATCH');
 assert.equal(classifyD1Failure('HTTP 403 forbidden'),'D1_ACCESS_DENIED');
 assert.equal(classifyD1Failure('unknown private detail bearer TOKEN_X'),'D1_SELECT_FAILED');
 assert.equal(safePublicError(new Error('LMS99_HISTORY_D1_SELECT_FAILED')),'LMS99_HISTORY_D1_SELECT_FAILED');
 assert.equal(safePublicError(new Error('SECRET_TOKEN_IN_ERROR')),'LMS99_HISTORY_FAILED');
});

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

test('SCORM 2004 completion_status passes only without explicit failure',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,tipo_conteudo TEXT);
  CREATE TABLE lms_matriculas(id INTEGER,curso_id INTEGER,empresa_id INTEGER,status TEXT,progresso_pct REAL,deleted_at TEXT);
  CREATE TABLE lms_matricula_ciclos(id INTEGER,matricula_id INTEGER,empresa_id INTEGER,status TEXT,ciclo_atual INTEGER);
  CREATE TABLE lms_ciclo_evidencias(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,ciclo_id INTEGER,enrollment_json TEXT,scorm_json TEXT);`);
  db.exec(`INSERT INTO lms_cursos VALUES(8,6,'scorm');
  INSERT INTO lms_matriculas VALUES(102,8,6,'EM_ANDAMENTO',99,NULL),(103,8,6,'EM_ANDAMENTO',99,NULL);
  INSERT INTO lms_matricula_ciclos VALUES(202,102,6,'EM_ANDAMENTO',0),(203,103,6,'EM_ANDAMENTO',0);`);
  const add=db.prepare('INSERT INTO lms_ciclo_evidencias VALUES(?,6,?,?,?,?)');
  add.run(300,102,202,'{"status":"EM_ANDAMENTO"}',JSON.stringify({
   lesson_status:null,completion_status:'completed',success_status:'passed',score_raw:82,
  }));
  add.run(301,103,203,'{"status":"EM_ANDAMENTO"}',JSON.stringify({
   lesson_status:'failed',completion_status:'completed',success_status:'passed',score_raw:82,
  }));
  const [row]=validateRows(db.prepare(ARCHIVE_SQL).all());
  assert.equal(row.curso_id,8);
  assert.equal(row.pending_99,2);
  assert.equal(row.archived_scorm_terminal,1);
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
