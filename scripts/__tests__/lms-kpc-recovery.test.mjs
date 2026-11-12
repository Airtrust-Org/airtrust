import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, validateCaseState } from '../production/lms-kpc-recovery.mjs';
test('KPC production repair has exactly three pinned identities', ()=>{
  assert.deepEqual(CASES.map(x=>x.id),[2058,1223,681]);
  assert.deepEqual(CASES.map(x=>x.course),[68,8,39]);
  assert.deepEqual(CASES.map(x=>x.employee),[37,22,67]);
});
test('KPC authorization checks reject another company, student, course, completion or certificate',()=>{
  const entry=CASES[0];
  const valid={id:2058,empresa_id:6,curso_id:68,funcionario_id:37,
    status:'EM_ANDAMENTO',progresso_pct:100,qualificacao_historico_id:null,
    closure_readiness:{code:'PROGRESS_EVIDENCE_MISSING'}};
  validateCaseState(valid,entry);
  for(const row of [
    {...valid,empresa_id:7},{...valid,funcionario_id:999},
    {...valid,curso_id:8},{...valid,status:'CONCLUIDO'},
    {...valid,progresso_pct:99},{...valid,qualificacao_historico_id:999},
    {...valid,closure_readiness:{code:'SCORM_READY_FOR_SERVER_VERIFICATION'}},
  ]) assert.throws(()=>validateCaseState(row,entry));
});
test('S76 can only execute exact verified 26/49 edition handoff',()=>{
  const row={id:681,empresa_id:6,curso_id:39,funcionario_id:67,status:'EM_ANDAMENTO',
    progresso_pct:51,qualificacao_historico_id:null,edition_mismatch:{required:true},
    active_resume_proposal:{targetPosition:26,activeTotal:49}};
  validateCaseState(row,CASES[2]);
  assert.throws(()=>validateCaseState({...row,active_resume_proposal:{targetPosition:25,activeTotal:49}},CASES[2]));
  assert.throws(()=>validateCaseState({...row,edition_mismatch:{required:false}},CASES[2]));
});
