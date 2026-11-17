import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CASES,selectCases,checkPreflight} from '../production/lms-adriana-edition-and-mgo-recovery.mjs';
test('pinned tenant-six cohort has six legacy edition mismatches plus one MGO missing decision',()=>{
  assert.deepEqual(CASES.map(x=>x.id),[1022,2044,2057,2092,2114,2123,2141]);
  assert.deepEqual(CASES.map(x=>x.employee),[1,1,35,98,145,154,172]);
  assert.deepEqual(CASES.map(x=>x.course),[21,68,68,68,68,68,68]);
});
test('cannot add, duplicate, or silently broaden affected enrollments',()=>{
  assert.deepEqual(selectCases('2044,1022').map(c=>c.id),[2044,1022]);
  for(const s of ['',' ','999','2044,2044','2096','2044;2057','2044,2057,2092,2114,2123,2141,1022,999'])
    assert.throws(()=>selectCases(s));
});
test('edition handoff requires immutable live enrollment and 61 to 59 preview, no approval',()=>{
  const x=CASES[1];
  const row={id:x.id,empresa_id:6,curso_id:68,funcionario_id:1,status:'EM_ANDAMENTO',
    progresso_pct:3,qualificacao_historico_id:null,edition_mismatch:{required:true,previous_total:61,active_total:59},
    scorm_handoff_available:true,active_resume_proposal:{status:'SUGGESTED_ANCHOR',reviewRequired:true,
      targetPosition:2,activeTotal:59,canMarkComplete:false}};
  checkPreflight(row,x);
  for(const bad of [{empresa_id:7},{funcionario_id:102},{status:'CONCLUIDO'},
    {progresso_pct:100},{qualificacao_historico_id:44},
    {edition_mismatch:{required:true,previous_total:60,active_total:59}},
    {scorm_handoff_available:false},{active_resume_proposal:{...row.active_resume_proposal,canMarkComplete:true}}])
      assert.throws(()=>checkPreflight({...row,...bad},x));
});
test('MGO recovery only if user-owned missing interactions remain, never infer completed from 42/42',()=>{
  const x=CASES[0];const row={id:1022,empresa_id:6,curso_id:21,funcionario_id:1,
    status:'EM_ANDAMENTO',progresso_pct:100,qualificacao_historico_id:null,
    completion_diagnostic:{can_finalize:false},
    closure_readiness:{code:'PROGRESS_EVIDENCE_MISSING',last_step_reached:true,
      missing:['manifest_required_units']}};
  checkPreflight(row,x);
  for(const bad of [{status:'CONCLUIDO'},{completion_diagnostic:{can_finalize:true}},
    {closure_readiness:{code:'PROGRESS_EVIDENCE_MISSING',last_step_reached:true,missing:[]}},
    {closure_readiness:{code:'SCORM_READY_FOR_SERVER_VERIFICATION',missing:['manifest_required_units'],last_step_reached:true}}])
      assert.throws(()=>checkPreflight({...row,...bad},x));
});
test('protected release gates, SHA and tenant are mandatory; no direct DB writes',()=>{
  const yaml=readFileSync('.github/workflows/production-lms-adriana-cohort-recovery.yml','utf8');
  const src=readFileSync('scripts/production/lms-adriana-edition-and-mgo-recovery.mjs','utf8');
  for(const marker of ['environment: production','git merge-base --is-ancestor',
    'verify-release-gates.mjs','LMS_ADRIANA']){}
  assert.match(yaml,/environment: production/);
  assert.match(yaml,/RELEASE_SHA="\$EXPECTED_PRODUCTION_SHA" node scripts\/ci\/verify-release-gates\.mjs/);
  assert.match(yaml,/RELEASE_SHA="\$GITHUB_SHA" node scripts\/ci\/verify-release-gates\.mjs/);
  assert.match(yaml,/\[\[ "\$live" == "\$EXPECTED_PRODUCTION_SHA" \]\]/);
  assert.match(src,/sha===process\.env\.RELEASE_SHA/);
  assert.doesNotMatch(src,/\bUPDATE\s+lms_|\bINSERT\s+INTO|\bDELETE\s+FROM/i);
});
