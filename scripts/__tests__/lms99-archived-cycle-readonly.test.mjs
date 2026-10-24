// source_reference: #1325 history recovery; disposable Node SQLite :memory: only.
// operational_decision: synthetic INSERTs test aggregate classification, not evidence of learner completion.
// dry_run_required: remote production query is SELECT-only and aggregated by course.
// rollback_plan_required: the in-memory DB is closed without any D1/R2 mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ARCHIVE_SQL,CYCLES_ONLY_SQL,CYCLES_SCHEMA_PROBE_SQL,SCHEMA_PROBE_SQL,TABLES_PROBE_SQL,validateCycleRows,validateCyclesSchemaRows,validateTableNames,PRODUCTION_D1_ID,NON_PRODUCTION_D1_IDS,assertSqlTransportScope,d1,validateSchemaRows,validateQuery,validateRows,classifyD1Failure,classifyD1RestRejection,safePublicError} from '../production/lms99-archived-cycle-readonly.mjs';

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

test('minimal table SELECT stays fixed and emits only four flags',async()=>{
 assert.match(TABLES_PROBE_SQL,/^SELECT name FROM sqlite_master/);
 assert.doesNotMatch(TABLES_PROBE_SQL,/UNION ALL|pragma_table_info|;/);
 assert.deepEqual(validateTableNames([{name:'lms_matriculas'},{name:'lms_cursos'}]),[
  {check_name:'lms_matriculas',present:1},{check_name:'lms_cursos',present:1},
  {check_name:'lms_matricula_ciclos',present:0},{check_name:'lms_ciclo_evidencias',present:0},
 ]);
 assert.throws(()=>validateTableNames([{name:'email'}]),/TABLE_RESULT_INVALID/);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE lms_matriculas(id INT); CREATE TABLE lms_cursos(id INT);');
  const checks=validateTableNames(db.prepare(TABLES_PROBE_SQL).all());
  assert.deepEqual(checks.map(x=>x.present),[1,1,0,0]);
 }finally{db.close();}
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

test('cycles-only reports prior-cycle indicators from the canonical 0346 schema, tenant scoped',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(`CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,tipo_conteudo TEXT);
  CREATE TABLE lms_matriculas(id INTEGER,curso_id INTEGER,empresa_id INTEGER,status TEXT,progresso_pct REAL,deleted_at TEXT);
  CREATE TABLE lms_matricula_ciclos(
   id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,matricula_id INTEGER,historico_importado_id INTEGER,
   curso_id INTEGER,funcionario_id INTEGER,numero_ciclo INTEGER NOT NULL DEFAULT 1,origem TEXT NOT NULL DEFAULT 'LMS',
   status TEXT NOT NULL DEFAULT 'NAO_INICIADO',ciclo_atual INTEGER NOT NULL DEFAULT 1,observacoes TEXT,data_matricula TEXT,
   data_inicio TEXT,data_conclusao TEXT,data_expiracao TEXT,progresso_pct INTEGER NOT NULL DEFAULT 0,
   score_final REAL,tentativas INTEGER NOT NULL DEFAULT 0,qualificacao_historico_id INTEGER,
   created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),deleted_at TEXT);
  INSERT INTO lms_cursos VALUES(10,6,'scorm'),(11,6,'scorm'),(12,6,'scorm'),(13,6,'scorm'),(10,7,'scorm');
  INSERT INTO lms_matriculas VALUES
   (100,10,6,'EM_ANDAMENTO',99,NULL),(101,10,6,'REPROVADO',100,NULL),
   (102,11,6,'EM_ANDAMENTO',99,NULL),(103,12,6,'EM_ANDAMENTO',99,NULL),
   (104,13,6,'EM_ANDAMENTO',99,NULL),(100,10,7,'EM_ANDAMENTO',99,NULL);
  INSERT INTO lms_matricula_ciclos
   (id,empresa_id,matricula_id,curso_id,numero_ciclo,status,ciclo_atual,data_conclusao,score_final,qualificacao_historico_id,deleted_at)
  VALUES
   (200,6,100,10,1,'CONCLUIDO',0,'2024-01-01',85,500,NULL),
   (201,6,101,10,1,'EM_ANDAMENTO',1,NULL,NULL,NULL,NULL),
   (202,6,102,11,1,'EM_ANDAMENTO',0,NULL,40,NULL,NULL),
   (205,6,102,11,2,'REPROVADO',0,'2024-02-01',40,501,NULL),
   (203,7,100,10,1,'CONCLUIDO',0,'2024-01-01',95,501,NULL),
   (204,6,104,13,1,'CONCLUIDO',0,'2024-02-01',NULL,NULL,'2024-03-01');`);

  const columns=new Set(db.prepare('PRAGMA table_info(lms_matricula_ciclos)').all().map(row=>row.name));
  for(const column of ['status','ciclo_atual','data_conclusao','score_final','qualificacao_historico_id','deleted_at'])
   assert.ok(columns.has(column),`canonical cycle column ${column} must exist in the fixture schema`);
  assert.doesNotMatch(CYCLES_ONLY_SQL,/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bPRAGMA\b/i);

  const rows=validateCycleRows(db.prepare(CYCLES_ONLY_SQL).all().map(row=>({...row})));
  assert.deepEqual(rows,[
   {curso_id:10,pending_99:2,prior_completed_cycle:1,prior_dated_completed:1,prior_score_recorded:1,prior_qualification_link:1},
   {curso_id:11,pending_99:1,prior_completed_cycle:0,prior_dated_completed:0,prior_score_recorded:1,prior_qualification_link:1},
   {curso_id:12,pending_99:1,prior_completed_cycle:0,prior_dated_completed:0,prior_score_recorded:0,prior_qualification_link:0},
   {curso_id:13,pending_99:1,prior_completed_cycle:0,prior_dated_completed:0,prior_score_recorded:0,prior_qualification_link:0},
  ]);
  assert.equal(rows.reduce((sum,row)=>sum+row.pending_99,0),5);
 }finally{db.close();}
});

test('cycles-only aggregate validator rejects conflicts, invalid bounds, duplicates and oversized cohorts',()=>{
 const valid={curso_id:10,pending_99:2,prior_completed_cycle:1,prior_dated_completed:1,prior_score_recorded:2,prior_qualification_link:0};
 assert.deepEqual(validateCycleRows([valid]),[valid]);
 assert.throws(()=>validateCycleRows([{...valid,prior_dated_completed:3}]),/CYCLE_BOUNDS/);
 assert.throws(()=>validateCycleRows([{...valid,prior_score_recorded:501}]),/CYCLE_METRIC_INVALID/);
 assert.throws(()=>validateCycleRows([valid,{...valid}]),/CYCLE_ID_INVALID/);
 assert.throws(()=>validateCycleRows(Array.from({length:101},(_,i)=>({...valid,curso_id:i+1,pending_99:1,prior_score_recorded:0}))),/CYCLE_ROW_LIMIT/);
 assert.throws(()=>validateCycleRows([{...valid,pending_99:501,prior_completed_cycle:0,prior_dated_completed:0,prior_score_recorded:0}]),/CYCLE_METRIC_INVALID/);
 assert.throws(()=>validateCycleRows(Array.from({length:2},(_,i)=>({...valid,curso_id:i+1,pending_99:300,prior_completed_cycle:0,prior_dated_completed:0,prior_score_recorded:0}))),/CYCLE_COHORT_LIMIT/);
});

test('physical cycle schema probe exposes only required column names and fails closed when one is missing',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE lms_matricula_ciclos (
   empresa_id INTEGER NOT NULL, matricula_id INTEGER, curso_id INTEGER,
   status TEXT NOT NULL, ciclo_atual INTEGER NOT NULL, data_conclusao TEXT,
   score_final REAL, qualificacao_historico_id INTEGER, deleted_at TEXT
  )`);
  const raw=db.prepare(CYCLES_SCHEMA_PROBE_SQL).all().map(row=>({...row}));
  const checks=validateCyclesSchemaRows(raw);
  assert.equal(checks.length,9);
  assert.ok(checks.every(check=>check.present));
  assert.equal(Object.hasOwn(checks[0],'sql'),false);
  assertSqlTransportScope(CYCLES_SCHEMA_PROBE_SQL);
  db.exec('DROP TABLE lms_matricula_ciclos');
  db.exec(`CREATE TABLE lms_matricula_ciclos (
   empresa_id INTEGER, matricula_id INTEGER, curso_id INTEGER, status TEXT,
   ciclo_atual INTEGER, data_conclusao TEXT, score_final REAL, deleted_at TEXT
  )`);
  assert.throws(()=>validateCyclesSchemaRows(db.prepare(CYCLES_SCHEMA_PROBE_SQL).all().map(row=>({...row}))),/CYCLE_SCHEMA_REQUIRED_COLUMN_MISSING/);
 }finally{db.close();}
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
 assert.match(workflow,/options: \[tables-probe, schema-probe, cycles-only, read\]/);
 assert.match(workflow,/\.mode=="cycles-only"/);
 assert.match(workflow,/\.schema_columns_present==true/);
 assert.doesNotMatch(workflow,/\bpush:|\bpull_request:/);
});
