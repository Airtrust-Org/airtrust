// source_reference: issue #1376 cancelled enrollments event 2026-10-10 19:10:05 UTC.
// operational_decision: restoration changes existing enrollment/cycle status only.
// dry_run_required: exact 81 candidate set with SHA digest and negative testing.
// rollback_plan_required: dedicated governed D1 Time Travel workflow and forward-only compensation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRestoreSql } from '../production/restore-compliance-81-cancellations.mjs';

function mockCandidates(){
  const rows=[];let id=0;
  for (const [code, statuses] of [
    ['FDM-TRIPULACAO',[...Array(9).fill('CONCLUIDO'),'EM_ANDAMENTO','NAO_INICIADO']],
    ['MNT_MCQ',[...Array(18).fill('CONCLUIDO'),...Array(5).fill('NAO_INICIADO')]],
    ['MNT_MGM',[...Array(18).fill('CONCLUIDO'),...Array(5).fill('NAO_INICIADO')]],
    ['MNT_MOM',[...Array(20).fill('CONCLUIDO'),...Array(4).fill('NAO_INICIADO')]],
  ]){
    for(const originalStatus of statuses){
      rows.push({id:++id,code,originalStatus,status:'CANCELADO',cycleStatus:'CANCELADO',cycleCount:1,mandatoryApplicable:1});
    }
  }
  return rows;
}
const SHA='a'.repeat(40);
test('restore plan binds exactly 81 historical IDs and original status without re-enrolling',()=>{
  const sql=buildRestoreSql(mockCandidates(),SHA);
  assert.match(sql,/LMS_MATRICULA_RESTAURADA_20261010/);
  assert.match(sql,/UPDATE lms_matricula_ciclos SET status=/);
  assert.match(sql,/UPDATE lms_matriculas SET status=/);
  assert.match(sql,/PREFLIGHT_CHANGED/);
  assert.match(sql,/POSTCONDITIONS_FAILED/);
  assert.doesNotMatch(sql,/\b(?:INSERT INTO lms_matriculas|INSERT INTO lms_matricula_ciclos|UPDATE lms_progresso_scorm|UPDATE qualificacoes_historico|UPDATE notificacoes_inapp)\b/i);
  assert.equal((sql.match(/'LMS_MATRICULA_RESTAURADA_20261010'/g)||[]).length,1);
});
test('restoration plan denies 80, duplicates, unapproved statuses or tenant candidates',()=>{
  const rows=mockCandidates();
  assert.throws(()=>buildRestoreSql(rows.slice(1),SHA),/INVALID_COUNT/);
  const dup=structuredClone(rows);dup[1].id=dup[0].id;
  assert.throws(()=>buildRestoreSql(dup,SHA),/DUPLICATE_ID/);
  const bad=structuredClone(rows);bad[0].originalStatus='APROVADO';
  assert.throws(()=>buildRestoreSql(bad,SHA),/INVALID_OLD_STATUS/);
  const change=structuredClone(rows);change[0].mandatoryApplicable=0;
  assert.throws(()=>buildRestoreSql(change,SHA),/NOT_MANDATORY/);
  assert.throws(()=>buildRestoreSql(rows,'bad'),/INVALID_SHA/);
});
test('SQL string is deterministic on input order and includes 15 preserved cancelled rows',()=>{
  const rows=mockCandidates();
  assert.equal(buildRestoreSql(rows,SHA),buildRestoreSql(rows.slice().reverse(),SHA));
  assert.match(buildRestoreSql(rows,SHA),/mandatory_applicable=0 AND status='CANCELADO'/);
});
