import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SQL,validate,assertStaticSql} from '../production/lms99-embedded-cmi-readonly.mjs';

test('production D1 query is static aggregate scoped to tenant 6',()=>{
 assert.doesNotThrow(()=>assertStaticSql(SQL));
 assert.match(SQL,/m\.empresa_id=6/);
 assert.match(SQL,/m\.deleted_at IS NULL/);
 assert.match(SQL,/GROUP BY curso_id/);
 assert.match(SQL,/json_valid/);
 assert.doesNotMatch(SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\s/i);
});
test('only aggregate counts, never student identifiers or grades, leave the runner',()=>{
 const row={curso_id:47,pending_99:2,json_present:2,formative:0,embedded_terminal_drift:1,
  embedded_score_above_mastery_drift:0,embedded_numeric_score:1,normalized_score_missing:1,
  normalized_score_below_mastery:1,explicit_failed:0};
 assert.deepEqual(validate([row]),[row]);
 assert.throws(()=>validate([{...row,embedded_numeric_score:3}]),/METRIC_INVALID/);
 assert.throws(()=>validate([row,{...row}]),/COURSE_INVALID/);
});

test('executes SQLite recovery SQL with numeric-string SCORM 1.2 and 2004 data', async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,scorm_mastery_score REAL,scorm_assessment_policy TEXT,tipo_conteudo TEXT);
  CREATE TABLE lms_matriculas(id INTEGER,empresa_id INTEGER,curso_id INTEGER,status TEXT,progresso_pct REAL,deleted_at TEXT);
  CREATE TABLE lms_progresso_scorm(matricula_id INTEGER,empresa_id INTEGER,lesson_status TEXT,success_status TEXT,score_scaled REAL,score_raw REAL,score_max REAL,score_min REAL,cmi_json TEXT);`);
  const course=db.prepare("INSERT INTO lms_cursos VALUES(?,?,70,'SCORED','scorm')");
  const enrollment=db.prepare("INSERT INTO lms_matriculas VALUES(?,6,?,'EM_ANDAMENTO',100,NULL)");
  const progress=db.prepare("INSERT INTO lms_progresso_scorm VALUES(?,6,'incomplete',NULL,NULL,NULL,NULL,NULL,?)");
  course.run(39,6);enrollment.run(101,39);
  progress.run(101,JSON.stringify({'cmi.core.lesson_status':'passed','cmi.core.score.raw':'85','cmi.core.score.max':'100'}));
  course.run(47,6);enrollment.run(102,47);
  progress.run(102,JSON.stringify({'cmi.completion_status':'completed','cmi.score.raw':'76','cmi.score.max':'100','cmi.score.scaled':'0.76'}));
  const rows=validate(db.prepare(SQL).all());
  assert.equal(rows.length,2);
  for(const row of rows){
   assert.equal(row.pending_99,1);
   assert.equal(row.embedded_numeric_score,1);
   assert.equal(row.embedded_score_above_mastery_drift,1);
   assert.equal(row.embedded_terminal_drift,1);
   assert.equal(row.normalized_score_missing,1);
  }
 }finally{db.close();}
});

test('protected workflow is read-only and enforces release gates',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/production-lms99-embedded-cmi-readonly.yml',import.meta.url),'utf8');
 assert.match(wf,/workflow_dispatch:/);
 assert.match(wf,/environment: production/);
 assert.match(wf,/verify-release-gates\.mjs/);
 assert.match(wf,/AIRTRUST_LMS99_EMBEDDED_CMI_READONLY/);
 assert.doesNotMatch(wf,/\bpush:|\bpull_request:/);
 const script=readFileSync(new URL('../production/lms99-embedded-cmi-readonly.mjs',import.meta.url),'utf8');
 assert.match(script,/DIAGNOSTIC_ONLY_NOT_PROOF_OF_PASS/);
 assert.doesNotMatch(script,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
});
