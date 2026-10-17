import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyFdmAudience, summarizeFdmAssignment } from '../production/lms-fdm13-reassignment-preflight-readonly.mjs';

test('legacy FDM13: only pilots and maintenance move; all other roles are excluded', () => {
  for(const value of ['Comandante','Copiloto'])
    assert.deepEqual(classifyFdmAudience(value),{group:'tripulacao',reason:null});
  for(const value of ['Mecânico','Auxiliar de Manutenção','Aux Manutenção'])
    assert.deepEqual(classifyFdmAudience(value),{group:'manutencao',reason:null});
  for(const value of ['Gerente de Operações','Gerente de Manutenção','Gerente de Segurança Operacional',
    'Analista FDM','Coordenador de Engenharia','Atendente','Gatekeeper'])
    assert.deepEqual(classifyFdmAudience(value),{group:null,reason:'OUT_OF_SCOPE_BY_USER_DECISION'});
  // A designated Gatekeeper who is also a pilot stays in the Tripulação course:
  // this does not grant or revoke any independent committee qualification.
  assert.deepEqual(classifyFdmAudience('Comandante', ['GATEKEEPER']),{group:'tripulacao',reason:null});
});

test('FDM preflight aggregates assignment without inventing completed SCORM records or exposing PII',()=>{
  const rows=[
    { funcionario_id:7, funcionario_nome:'private',status:'EM_ANDAMENTO',progresso_pct:100 },
    { funcionario_id:9, funcionario_nome:'private 2',status:'CONCLUIDO',progresso_pct:100 },
    { funcionario_id:11,funcionario_nome:'private 3',status:'EM_ANDAMENTO',progresso_pct:99 },
    { funcionario_id:12,funcionario_nome:'private 4',status:'EM_ANDAMENTO',progresso_pct:0 },
    { funcionario_id:13,funcionario_nome:'private 5',status:'NAO_INICIADO',progresso_pct:0 },
  ];
  const employees=new Map([[7,{funcao_nome:'Comandante'}],[9,{funcao_nome:'Mecânico'}],
    [11,{funcao_nome:'Gerente de Segurança Operacional'}],[13,{funcao_nome:'Atendente'}]]);
  const summary=summarizeFdmAssignment(rows,employees,{tripulacao:{ready:false}});
  assert.equal(summary.source_total,5);
  assert.equal(summary.groups.tripulacao,1);
  assert.equal(summary.groups.manutencao,1);
  assert.equal(summary.excluded_from_migration,2);
  assert.equal(summary.needs_review.EMPLOYEE_NOT_IN_ACTIVE_CATALOG,1);
  assert.equal(summary.source_completed,1);
  assert.equal(summary.source_raw_100_without_completion,1);
  assert.equal(summary.unfinished_99_or_more,2);
  assert.equal(summary.eligible_unfinished_99_or_more,1);
  assert.equal(summary.excluded_unfinished_99_or_more,1);
  assert.equal(summary.conditions.production_write_executed,false);
  assert.equal(summary.conditions.out_of_scope_legacy_enrollments_are_soft_cancel_candidates_only,true);
  const destinations={tripulacao:new Set([7]),manutencao:new Set([9])};
  const withDest=summarizeFdmAssignment(rows,employees,{tripulacao:{ready:false}},destinations);
  assert.equal(withDest.already_target_enrolled,2);
  assert.doesNotMatch(JSON.stringify(summary), /private|funcionario_id/);
});

test('FDM preflight is production-SHA-pinned, scoped and has no D1/R2/LMS write capability',()=>{
  const s=readFileSync(new URL('../production/lms-fdm13-reassignment-preflight-readonly.mjs',import.meta.url),'utf8');
  const w=readFileSync(new URL('../../.github/workflows/production-lms-fdm13-reassignment-preflight-readonly.yml',import.meta.url),'utf8');
  assert.match(s,/SOURCE_COURSE = 13/);
  // The legacy source can be inactive/unpublished and is therefore absent
  // from the regular catalog. It must still be checked by its scoped detail
  // endpoint before its historical enrollments are considered.
  assert.match(s,/safeGet\(token,'\/api\/lms\/cursos\/'\+SOURCE_COURSE\)/);
  assert.match(s,/Number\(sourceCourse\?\.data\?\.id\)===SOURCE_COURSE/);
  assert.match(s,/ADMIN_FULL_TENANT_REQUIRED/);
  assert.match(s,/PRODUCTION_SHA_MISMATCH/);
  assert.match(s,/TENANT_CONTEXT_MISMATCH/);
  assert.match(s,/OUT_OF_SCOPE_BY_USER_DECISION/);
  assert.match(s,/TRANSFER_DESTINATIONS_NOT_READY/);
  assert.match(s,/out_of_scope_legacy_enrollments_are_soft_cancel_candidates_only/);
  assert.doesNotMatch(s,/\/api\/compliance-treinamentos\/condicoes\/atribuicoes/);
  assert.match(s,/\/api\/qualificacoes\/tipos\?search=FDM&limit=500/);
  assert.match(s,/QUALIFICATION_LIST_POSSIBLY_TRUNCATED/);
  assert.match(s,/qualification_models_active/);
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
