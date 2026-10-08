import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyFdmAudience, summarizeFdmAssignment } from '../production/lms-fdm13-reassignment-preflight-readonly.mjs';

test('FDM role/duty assignment uses only explicitly approved roles and actual designations', () => {
  for(const value of ['Comandante','Copiloto']){
    assert.deepEqual(classifyFdmAudience(value),{group:'tripulacao',reason:null});
  }
  for(const value of ['Mecânico','Auxiliar de Manutenção','Aux Manutenção']){
    assert.deepEqual(classifyFdmAudience(value),{group:'manutencao',reason:null});
  }
  for(const value of ['Gerente de Operações','Gerente de Manutenção','Gerente de Segurança Operacional','Analista FDM','Coordenador de Engenharia']){
    assert.deepEqual(classifyFdmAudience(value),{group:'comite_gatekeeper',reason:null});
  }
  assert.deepEqual(classifyFdmAudience('Assistente Administrativo',['GATEKEEPER']),{group:'comite_gatekeeper',reason:null});
  assert.deepEqual(classifyFdmAudience('Assistente Administrativo',['FDM_COMITE']),{group:'comite_gatekeeper',reason:null});
  assert.deepEqual(classifyFdmAudience('Comandante',['GATEKEEPER']),{group:null,reason:'MULTIPLE_ELIGIBLE_AUDIENCES'});
  assert.deepEqual(classifyFdmAudience('Atendente'),{group:null,reason:'UNMAPPED_ROLE'});
});

test('FDM preflight aggregates assignment without inventing completed SCORM records or exposing PII',()=>{
  const rows=[
    { funcionario_id:7, funcionario_nome:'private',status:'EM_ANDAMENTO',progresso_pct:100 },
    { funcionario_id:9, funcionario_nome:'private 2',status:'CONCLUIDO',progresso_pct:100 },
    { funcionario_id:11,funcionario_nome:'private 3',status:'EM_ANDAMENTO',progresso_pct:99 },
    { funcionario_id:12,funcionario_nome:'private 4',status:'EM_ANDAMENTO',progresso_pct:0 },
  ];
  const employees=new Map([[7,{funcao_nome:'Comandante'}],[9,{funcao_nome:'Mecânico'}],[11,{funcao_nome:'Comandante'}]]);
  const assignments=new Map([[11,['GATEKEEPER']]]);
  const summary=summarizeFdmAssignment(rows,employees,assignments,{tripulacao:{ready:false}});
  assert.equal(summary.source_total,4);
  assert.equal(summary.groups.tripulacao,1);
  assert.equal(summary.groups.manutencao,1);
  assert.equal(summary.needs_review.MULTIPLE_ELIGIBLE_AUDIENCES,1);
  assert.equal(summary.needs_review.EMPLOYEE_NOT_IN_ACTIVE_CATALOG,1);
  assert.equal(summary.source_completed,1);
  assert.equal(summary.source_raw_100_without_completion,1);
  assert.equal(summary.unfinished_99_or_more,2);
  assert.equal(summary.conditions.production_write_executed,false);
  assert.doesNotMatch(JSON.stringify(summary), /private|funcionario_id/);
});

test('FDM preflight is production-SHA-pinned, scoped and has no D1/R2/LMS write capability',()=>{
  const s=readFileSync(new URL('../production/lms-fdm13-reassignment-preflight-readonly.mjs',import.meta.url),'utf8');
  const w=readFileSync(new URL('../../.github/workflows/production-lms-fdm13-reassignment-preflight-readonly.yml',import.meta.url),'utf8');
  assert.match(s,/SOURCE_COURSE = 13/);
  assert.match(s,/ADMIN_FULL_TENANT_REQUIRED/);
  assert.match(s,/PRODUCTION_SHA_MISMATCH/);
  assert.match(s,/TENANT_CONTEXT_MISMATCH/);
  assert.match(s,/FDM_COMITE/);
  assert.match(s,/GATEKEEPER/);
  assert.match(s,/DESIGNATION_ASSIGNMENTS_MISSING/);
  assert.match(s,/DESTINATION_LMS_COURSES_NOT_READY/);
  assert.doesNotMatch(s,/method:\s*['"](?:PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(s,/\/api\/lms\/matriculas\/scorm\/commit/);
  assert.match(w,/AIRTRUST_PRODUCTION_LMS_FDM13_REASSIGNMENT_PREFLIGHT_READONLY/);
  assert.match(w,/verify-release-gates\.mjs/);
  assert.match(w,/environment: production/);
  assert.match(w,/secrets\.PROD_SMOKE_EMAIL/);
  assert.match(w,/actions\/upload-artifact@v7/);
  assert.doesNotMatch(w,/\bpush:/);
  assert.doesNotMatch(w,/\bpull_request:/);
});
