#!/usr/bin/env node
// source_reference: issue #648 / PR #649 staging tenant-isolation decision
// operational_decision: read-only staging diagnostic; 0490 is production-tenant-only
// dry_run_required: always read-only
// rollback_plan_required: not applicable; no writes are issued
import { spawnSync } from 'node:child_process';

const DB = 'airtrust-db-staging-baseline-20260701';
const requested = process.env.STAGING_D1_NAME || DB;
if (requested !== DB || /prod/i.test(requested)) throw new Error(`STAGING_TARGET_REFUSED:${requested}`);

function d1(sql) {
  if (!/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) throw new Error('READ_ONLY_SQL_REQUIRED');
  const result = spawnSync('npx', ['wrangler','d1','execute',requested,'--remote','--json','--command',sql], {
    cwd: 'worker-airtrust', encoding: 'utf8', env: process.env,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'D1_QUERY_FAILED');
  const start = result.stdout.indexOf('['), end = result.stdout.lastIndexOf(']');
  const payload = JSON.parse(start >= 0 && end > start ? result.stdout.slice(start, end + 1) : result.stdout);
  return payload[0]?.results || [];
}

const tenants = d1(`SELECT id,codigo,nome FROM empresas WHERE (id=6 OR codigo='qa_examiner_training') AND deleted_at IS NULL ORDER BY id;`);
const tenant6 = tenants.find(row => Number(row.id) === 6) || null;
const qaTenant = tenants.find(row => row.codigo === 'qa_examiner_training') || null;
const qaStats = qaTenant ? d1(`SELECT
  (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=${Number(qaTenant.id)} AND deleted_at IS NULL) AS qtypes,
  (SELECT COUNT(*) FROM modelos_sessao WHERE empresa_id=${Number(qaTenant.id)} AND deleted_at IS NULL) AS models,
  (SELECT COUNT(*) FROM modelos_sessao_versionamento WHERE empresa_id=${Number(qaTenant.id)} AND is_current=1) AS current_versions;`)[0] : null;
const qaPlanningResidue = qaTenant ? d1(`SELECT
  (SELECT COUNT(*) FROM treinamentos_planejados WHERE empresa_id=${Number(qaTenant.id)} AND planejamento_origem='SIMULADOR_V3_PERSISTED' AND planejamento_snapshot_json LIKE '%QA_SIMULATOR_PLANNING_SMOKE%' AND deleted_at IS NULL) AS drafts,
  (SELECT COUNT(*) FROM escalas_mensais WHERE empresa_id=${Number(qaTenant.id)} AND id='QA-SIM-PLN-ROSTER' AND deleted_at IS NULL) AS roster,
  (SELECT COUNT(*) FROM escala_alocacoes WHERE id IN ('QA-SIM-PLN-ALFA-FOLGA','QA-SIM-PLN-BRAVO-FOLGA','QA-SIM-PLN-CHARLIE-FOLGA') AND deleted_at IS NULL) AS allocations,
  (SELECT COUNT(*) FROM qualificacoes_historico WHERE empresa_id=${Number(qaTenant.id)} AND observacoes='QA_ONLY_SIMULATOR_PLANNING' AND deleted_at IS NULL) AS histories,
  (SELECT COUNT(*) FROM modelos_sessao WHERE empresa_id=${Number(qaTenant.id)} AND codigo='QA-SIM-PLN-S01' AND deleted_at IS NULL) AS models,
  (SELECT COUNT(*) FROM modelos_sessao_versionamento WHERE empresa_id=${Number(qaTenant.id)} AND codigo_canonico='QA-SIM-PLN-S01' AND versao_matriz='QA_SIMULATOR_PLANNING') AS versions,
  (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${Number(qaTenant.id)} AND matricula IN ('QA-PARTICIPANTE-ALFA','QA-PARTICIPANTE-BRAVO') AND quinzena IS NOT NULL AND deleted_at IS NULL) AS base_scale_overrides,
  (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${Number(qaTenant.id)} AND matricula='QA-PARTICIPANTE-CHARLIE' AND deleted_at IS NULL) AS charlie;`)[0] : null;
const migration0490Rows = d1(`SELECT COUNT(*) AS count FROM d1_migrations WHERE name='0490_simulator_planning_curriculum_metadata.sql';`);
const migration0490Ledgered = Number(migration0490Rows[0]?.count || 0) > 0;
const residueCount = Object.values(qaPlanningResidue || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const qaPlanningHygieneClean = residueCount === 0;

const identityIsolated = tenant6?.codigo === 'edb_pilot_smoke' && Boolean(qaTenant);
const qaFixturePresent = Boolean(qaStats) && Number(qaStats.models || 0) > 0 && Number(qaStats.current_versions || 0) > 0;
const safe = identityIsolated && !migration0490Ledgered;
const diagnosis = safe ? 'STAGING_TENANT_IDENTITY_ISOLATED' : 'STAGING_TENANT_ISOLATION_DRIFT';

console.log(JSON.stringify({
  target: requested,
  mode: 'READ_ONLY',
  diagnosis,
  safe_for_production_tenant_0490: false,
  tenant_6: tenant6,
  qa_tenant: qaTenant,
  qa_fixture: qaStats,
  qa_fixture_present: qaFixturePresent,
  qa_planning_residue: qaPlanningResidue,
  qa_planning_hygiene_clean: qaPlanningHygieneClean,
  migration_0490_ledgered_in_staging: migration0490Ledgered,
  assertions: {
    tenant_6_is_edb_pilot_smoke: tenant6?.codigo === 'edb_pilot_smoke',
    qa_examiner_training_exists: Boolean(qaTenant),
    production_tenant_0490_not_ledgered: !migration0490Ledgered,
    disposable_planning_fixture_clean: qaPlanningHygieneClean,
  },
  next_action: safe
    ? (qaPlanningHygieneClean
      ? 'DEPLOY_REVIEWED_STAGING_SHA_THEN_RUN_STAGING_SIMULATOR_PLANNING_PERSISTENCE_QA'
      : 'RUN_GOVERNED_PERSISTENCE_QA_WITH_FAIL_CLOSED_PRE_CLEAN')
    : 'STOP_AND_RECONCILE_STAGING_TENANT_IDENTITY',
}, null, 2));
if (!safe) process.exitCode = 3;
