import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGatekeeperAdminCreditPlan, AUDIT_MARKER } from '../production/lms-gatekeeper14-admin-credit-domain.mjs';

const source = () => [23,24].map((id,i) => ({
  source_id:id,source_empresa_id:6,source_curso_id:14,source_deleted:null,
  source_status:'CONCLUIDO',source_progress:100,source_completed_at:'2026-04-29',
  employee_active:1,employee_id:500+i,
  target_id:800+i,target_empresa_id:6,target_curso_id:73,target_deleted:null,
  target_status:'NAO_INICIADO',target_progress:0,target_completed_at:null,
}));
const cycles = () => [800,801].map((matricula_id,i) => ({
  id:900+i,empresa_id:6,curso_id:73,matricula_id,status:'NAO_INICIADO',
  progresso_pct:0,ciclo_atual:1,
}));
const opts = () => ({
  targetReady:true,targetTotal:2,targetScormProgressCount:0,targetQualificationHistoryCount:0,
});

test('exact two-source administrative credit plan is stable and has no PII', () => {
  const plan = buildGatekeeperAdminCreditPlan(source(), cycles(), opts());
  assert.equal(plan.summary.candidates,2);
  assert.match(plan.summary.candidate_hash,/^[0-9a-f]{64}$/);
  assert.equal(plan.summary.candidate_hash,
    buildGatekeeperAdminCreditPlan([...source()].reverse(),cycles(),opts()).summary.candidate_hash);
  assert.equal(JSON.stringify(plan.summary).includes('employee_id'),false);
  assert.equal(plan.summary.administrative_equivalence_only,true);
  assert.equal(plan.summary.new_scorm_claimed_completed,false);
});
test('legacy must be canonically concluded with 100%, completion date and active employee', () => {
  for (const [field,value] of [['source_status','CANCELADO'],['source_progress',99],
    ['source_completed_at',null],['employee_active',0],['source_deleted','2026-10-08']]) {
    const rows=source();rows[0][field]=value;
    assert.throws(()=>buildGatekeeperAdminCreditPlan(rows,cycles(),opts()),/GATEKEEPER_ADMIN_CREDIT_/);
  }
});
test('no destination already completed, duplicated, soft-deleted, or with SCORM/qualification state', () => {
  for (const [field,value] of [['target_status','CONCLUIDO'],['target_progress',50],
    ['target_deleted','2026-10-08'],['target_curso_id',72]]) {
    const rows=source();rows[0][field]=value;
    assert.throws(()=>buildGatekeeperAdminCreditPlan(rows,cycles(),opts()),/GATEKEEPER_ADMIN_CREDIT_/);
  }
  assert.throws(()=>buildGatekeeperAdminCreditPlan(source(),cycles(),{...opts(),targetTotal:3}));
  assert.throws(()=>buildGatekeeperAdminCreditPlan(source(),cycles(),{...opts(),targetScormProgressCount:1}));
  assert.throws(()=>buildGatekeeperAdminCreditPlan(source(),cycles(),{...opts(),targetQualificationHistoryCount:1}));
});
test('every target must have exactly one unstarted current cycle', () => {
  assert.throws(()=>buildGatekeeperAdminCreditPlan(source(),cycles().slice(0,1),opts()));
  const duplicate=cycles();duplicate[1].matricula_id=800;
  assert.throws(()=>buildGatekeeperAdminCreditPlan(source(),duplicate,opts()));
  const invalid=cycles();invalid[0].status='CONCLUIDO';
  assert.throws(()=>buildGatekeeperAdminCreditPlan(source(),invalid,opts()));
});
test('reviewed operator keeps SCORM, certificates and historical source out of mutations', () => {
  const src=readFileSync(new URL('../production/lms-gatekeeper14-admin-credit-governed.mjs',import.meta.url),'utf8');
  assert.match(src,/GATEKEEPER_CREDIT_EXPECTED_HASH/);
  assert.match(src,/GATEKEEPER_CREDIT_RECOVERY_READY/);
  assert.match(src,/UPDATE lms_matriculas SET/);
  assert.match(src,/UPDATE lms_matricula_ciclos SET/);
  assert.match(src,/INSERT INTO audit_logs/);
  assert.match(src,/AUDIT_MARKER/);
  assert.doesNotMatch(src,/INSERT INTO (?:lms_progresso_scorm|qualificacoes_historico|certificados)/);
  assert.match(AUDIT_MARKER,/GATEKEEPER14_FDM73_ADMIN_CREDIT_SOURCE_/);
});
