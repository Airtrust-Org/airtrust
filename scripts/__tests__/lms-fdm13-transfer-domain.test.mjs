import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationForRole,buildTransferPlan,publicSummary} from '../production/lms-fdm13-transfer-domain.mjs';

function fixture(){
 const rows=[];
 for(let i=1;i<=27;i++){
  const role=i<=11?(i%2?'Comandante':'Copiloto'):i<=21?(i%2?'Mecânico':'Auxiliar de Manutenção'):'Gatekeeper';
  rows.push({id:1000+i,funcionario_id:2000+i,empresa_id:6,curso_id:13,
   status:'CANCELADO',deleted_at:null,employee_active:1,funcao_nome:role,
   progresso_pct:i===1?99:i===2?98:i===12?100:0});
 }
 return rows;
}
test('role mapping is strict, accent-insensitive, and never credits committee by title',()=>{
 assert.equal(destinationForRole('COMANDANTE'),71);
 assert.equal(destinationForRole('Copiloto'),71);
 assert.equal(destinationForRole('Mecânico'),72);
 assert.equal(destinationForRole('Aux Manutenção'),72);
 assert.equal(destinationForRole('Auxiliar de Manutenção'),72);
 for(const role of ['Gatekeeper','Gerente de Operações','Analista FDM','Coordenador FDM','Outro'])
  assert.equal(destinationForRole(role),null);
});
test('27 canceled eligible source rows yield exactly 21 destinations, 6 excluded; 99% credits administratively',()=>{
 const plan=buildTransferPlan(fixture(),[],{softDeletedSourceCount:5});
 assert.equal(plan.rows.length,21);
 assert.equal(plan.summary.tripulacao,11);
 assert.equal(plan.summary.manutencao,10);
 assert.equal(plan.summary.out_of_scope,6);
 assert.equal(plan.summary.credited_at_99,2);
 assert.equal(plan.summary.needs_fresh_training,19);
 assert.equal(plan.rows[0].legacy_progress_pct,99);
 assert.equal(plan.rows[0].target_status,'CONCLUIDO');
 assert.equal(plan.rows[1].legacy_progress_pct,98);
 assert.equal(plan.rows[1].target_status,'NAO_INICIADO');
 assert.equal(plan.summary.committee_course_73_untouched,true);
 assert.equal(plan.summary.administrative_not_scorm,true);
 assert.match(plan.summary.candidate_hash,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(publicSummary(plan)).includes('employee_id'),false);
 assert.equal(JSON.stringify(publicSummary(plan)).includes('source_id'),false);
 assert.deepEqual(publicSummary(buildTransferPlan(fixture().reverse(),[],{softDeletedSourceCount:5})),publicSummary(plan));
});
test('source must match reviewed tenant, cohort, status, activity and uniqueness',()=>{
 const f=fixture();
 assert.throws(()=>buildTransferPlan(f,[],{softDeletedSourceCount:4}),/SOFT_DELETED_COUNT_CHANGED/);
 assert.throws(()=>buildTransferPlan(f.slice(1),[],{softDeletedSourceCount:5}),/COHORT_SIZE_CHANGED/);
 assert.throws(()=>buildTransferPlan([{...f[0],empresa_id:5},...f.slice(1)],[],{softDeletedSourceCount:5}),/SOURCE_SCOPE_INVALID/);
 assert.throws(()=>buildTransferPlan([{...f[0],status:'CONCLUIDO'},...f.slice(1)],[],{softDeletedSourceCount:5}),/SOURCE_NOT_ACTIVE_CANCELLED/);
 assert.throws(()=>buildTransferPlan([{...f[0],employee_active:0},...f.slice(1)],[],{softDeletedSourceCount:5}),/SOURCE_EMPLOYEE_NOT_ACTIVE/);
 assert.throws(()=>buildTransferPlan([{...f[0],explicit_scorm_failure:1},...f.slice(1)],[],{softDeletedSourceCount:5}),/LEGACY_EXPLICIT_FAILURE_REQUIRES_REVIEW/);
 assert.throws(()=>buildTransferPlan([{...f[0],funcionario_id:f[1].funcionario_id},...f.slice(1)],[],{softDeletedSourceCount:5}),/SOURCE_DUPLICATE_EMPLOYEE/);
});
test('existing destination enrollment must prove exact provenance and expected status; committee stays untouched',()=>{
 const f=fixture(),m=f[0];
 const t={empresa_id:6,curso_id:71,funcionario_id:m.funcionario_id,status:'CONCLUIDO',
  deleted_at:null,has_current_cycle:1,has_administrative_qualification:1,observacoes:'FDM13_ADMIN_TRANSFER_SOURCE_'+m.id};
 let plan=buildTransferPlan(f,[t,{empresa_id:6,curso_id:73,funcionario_id:9999,
   status:'NAO_INICIADO',deleted_at:null}],{softDeletedSourceCount:5});
 assert.equal(plan.summary.already_transferred,1);
 assert.equal(plan.rows.length,20);
 assert.throws(()=>buildTransferPlan(f,[{...t,observacoes:''}],{softDeletedSourceCount:5}),/TARGET_HISTORY_REQUIRES_REVIEW/);
 assert.throws(()=>buildTransferPlan(f,[{...t,status:'CANCELADO'}],{softDeletedSourceCount:5}),/TARGET_TRANSFER_STATUS_DRIFT/);
 assert.throws(()=>buildTransferPlan(f,[{...t,has_current_cycle:0}],{softDeletedSourceCount:5}),/TARGET_CYCLE_MISSING/);
 assert.throws(()=>buildTransferPlan(f,[{...t,has_administrative_qualification:0}],{softDeletedSourceCount:5}),/TARGET_ADMIN_QUALIFICATION_MISSING/);
 assert.throws(()=>buildTransferPlan(f,[t,t],{softDeletedSourceCount:5}),/TARGET_DUPLICATE/);
});
