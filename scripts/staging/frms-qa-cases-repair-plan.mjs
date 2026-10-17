#!/usr/bin/env node
// source_reference: #1426, read-only run #39076290801, fixture #1550.
// operational_decision: stage a reviewed eight-row-only QA repair plan; NEVER execute it.
// dry_run_required: this script emits only SHA-256 and structural summary, zero SQL to remote.
// rollback_plan_required: line-level encrypted preimage and compensation under separate authorized workflow.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TENANT_ID, DB_ID, DB_NAME, validateSource } from './seed-frms-ux-30d.mjs';
import { expectedQaCases, LEGACY_CASE_BASELINE } from './inspect-frms-ux-cases.mjs';

export const TARGET = Object.freeze({ tenant_id: TENANT_ID, db_name: DB_NAME, db_id: DB_ID });
export const REVIEWED_SOURCE_SHA = '3f4017dd0ecdf03afbad4d39ecf8de06c05e0861';
export const REVIEWED_AGGREGATE_RUN = '38452591092';
export const READONLY_EVIDENCE_RUN = '39076290801';
export const EXPECTED_IDS = Object.freeze([1, 2, 3, 4].map(n => 'qa-frms-ux-case-' + n));
const SYNTHETIC = 'CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL';
const OLD_SYNTHETIC = 'CENARIO SINTETICO - SEM VALIDADE OPERACIONAL';
const MSG = 'QA SINTETICO: revisar contexto e registrar providencia';
const q = x => "'" + String(x).replaceAll("'", "''") + "'";

export function buildReviewPlan(days) {
  const expected = expectedQaCases(days);
  if (expected.length !== 4 || expected.some((x,i) => x.id !== EXPECTED_IDS[i]))
    throw new Error('EXPECTED_FOUR_CASES_ONLY');
  const operations = [];
  for (const [i, want] of expected.entries()) {
    const old = LEGACY_CASE_BASELINE[i];
    if (old.id !== want.id || old.kind !== want.kind) throw new Error('LEGACY_EXPECTATION_MISMATCH');
    const jid = 'qa-frms-ux-j-' + want.date + '-' + want.matricula;
    const newCrew = `(SELECT f.id FROM funcionarios f WHERE f.empresa_id=${TENANT_ID}
      AND f.matricula=${q(want.matricula)} AND f.ativo=1 AND f.deleted_at IS NULL)`;
    const oldCrew = `(SELECT f.id FROM funcionarios f WHERE f.empresa_id=${TENANT_ID}
      AND f.matricula=${q(old.owner)} AND f.ativo=1 AND f.deleted_at IS NULL)`;
    const journeySelect = `(SELECT j.id FROM frms_jornada j WHERE j.id=${q(jid)}
      AND j.empresa_id=${TENANT_ID} AND j.tripulante_id=${newCrew}
      AND j.data=${q(want.date)} AND j.deleted_at IS NULL
      AND j.registrado_por='QA_FRMS_UX' AND j.origem='SIGVOOS'
      AND j.observacao=${q(SYNTHETIC)})`;
    const durationSelect = `(SELECT j.duracao_jornada_minutos FROM frms_jornada j
      WHERE j.id=${q(jid)} AND j.empresa_id=${TENANT_ID}
      AND j.tripulante_id=${newCrew} AND j.data=${q(want.date)}
      AND j.registrado_por='QA_FRMS_UX' AND j.origem='SIGVOOS'
      AND j.observacao=${q(SYNTHETIC)} AND j.deleted_at IS NULL)`;
    operations.push({
      table:'frms_jornada', id:jid, kind:'CAS_STAGING_SYNTHETIC_ORIGIN',
      sql:`UPDATE frms_jornada SET origem='SIGVOOS', observacao=${q(SYNTHETIC)}, updated_at=datetime('now')
      WHERE id=${q(jid)} AND empresa_id=${TENANT_ID} AND tripulante_id=${newCrew}
      AND data=${q(want.date)} AND registrado_por='QA_FRMS_UX'
      AND origem='MANUAL' AND observacao=${q(OLD_SYNTHETIC)}
      AND duracao_jornada_minutos > 0 AND deleted_at IS NULL`,
    });
    operations.push({
      table:'frms_alerta', id:want.id, kind:'CAS_STAGING_FIXTURE_LINK',
      sql:`UPDATE frms_alerta SET tripulante_id=${newCrew}, jornada_id=${journeySelect},
      valor_atual_min=${durationSelect}, updated_at=datetime('now')
      WHERE id=${q(old.id)} AND tripulante_id=${oldCrew}
      AND tipo_limite=${q(old.kind)} AND nivel=${q(old.level)}
      AND date(created_at)=${q(old.day)}
      AND jornada_id IS NULL AND resolvido=0 AND deleted_at IS NULL
      AND valor_atual_min=620 AND valor_limite_min=540
      AND mensagem=${q(MSG)}
      AND COALESCE(TRIM(notas_resolucao),'')=''
      AND ${journeySelect} IS NOT NULL AND ${durationSelect} > 0`,
    });
  }
  const sql = operations.map(x => x.sql.trim()).join(';\n') + ';\n';
  const sha256 = createHash('sha256').update(sql).digest('hex');
  return {
    target:TARGET,
    reviewed_aggregate_run: REVIEWED_AGGREGATE_RUN,
    reviewed_source_sha: REVIEWED_SOURCE_SHA,
    readonly_evidence_run: READONLY_EVIDENCE_RUN,
    operations,
    sql_sha256:sha256,
    apply_authorized:false,
    writes:0,
    compensation:'mandatory encrypted row preimage + compare-and-swap inverse SQL, independently authorized',
  };
}

export function assertReviewPlan(plan) {
  if (plan.target.tenant_id !== 999013 || plan.target.db_id !== DB_ID ||
      plan.operations.length !== 8 || plan.operations.filter(x=>x.table==='frms_alerta').length!==4 ||
      plan.operations.filter(x=>x.table==='frms_jornada').length!==4 ||
      new Set(plan.operations.map(x=>x.id)).size!==8 ||
      plan.operations.some(x=>!/^(?:UPDATE frms_jornada|UPDATE frms_alerta) SET /.test(x.sql) ||
        /\b(?:DELETE|INSERT|DROP|ALTER|REPLACE|ATTACH|PRAGMA)\b/i.test(x.sql) ||
        !x.sql.includes('deleted_at IS NULL') ||
        !x.sql.includes('QA_FRMS_UX') && x.table==='frms_jornada'))
    throw new Error('REPAIR_PLAN_SCOPE_REJECTED');
  return true;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  try {
    const path=process.env.SANITIZED_AGGREGATE_PATH;
    if (!path || process.argv.slice(2).length ||
        process.env.FRMS_QA_MODE==='apply') throw new Error('REVIEW_DRYRUN_ONLY');
    const days=validateSource(JSON.parse(readFileSync(path,'utf8')),REVIEWED_SOURCE_SHA);
    const plan=buildReviewPlan(days);
    assertReviewPlan(plan);
    console.log(JSON.stringify({
      phase:'REVIEW_ONLY_NO_D1_ACCESS', tenant_id:plan.target.tenant_id,
      operations:plan.operations.map(x=>({table:x.table,id:x.id})),
      sql_sha256:plan.sql_sha256, preimage_required:true,
      time_travel_bookmark_required:true, postcheck_required:true,
      compensation_required:true, explicit_sha_scoped_authorization_required:true,
      writes:0,
    }));
  } catch (error) {
    console.error('FRMS_QA_REVIEW_PLAN_BLOCKED: '+error.message);
    process.exitCode=1;
  }
}
