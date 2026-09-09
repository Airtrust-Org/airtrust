#!/usr/bin/env node
// F4-03 / 0435 deterministic six-row production repair.
//
// source_reference: issue #414; archival 2026-07-15 exact 18-row incident transcript;
//                    governed F4-03 certificate-recovery run 34300482240 on
//                    e3ba052e2796c2ea33ccb7685334f441b897c54d.
// operational_decision: repair only the six exact tenant-6 historical rows whose
//                       current expiry still differs from the immutable pre-incident
//                       certificate. Never reuse the broad 0435 LMS-text heuristic.
// dry_run_required: dry-run mode must pass the same identity/current-value/certificate
//                   guards before apply is authorized.
// rollback_plan_required: D1 Time Travel recovery point is captured by the workflow;
//                         exact reverse values are versioned in
//                         scripts/rollback/f4-03-0435-six-row-repair.sql.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const INCIDENT_AT = '2026-07-15 19:05:19';

const CONFIRMATION_DRY_RUN = 'AIRTRUST_PRODUCTION_DRYRUN_F4_03_REPAIR';
const CONFIRMATION_APPLY = 'AIRTRUST_PRODUCTION_APPLY_F4_03_REPAIR_6_ROWS';

const TARGETS = Object.freeze([
  {
    id: 4595,
    qualificacaoId: 130,
    code: 'MNT_AW139',
    completion: '2023-02-16',
    currentExpiry: '2025-02-16',
    targetExpiry: '2026-02-16',
    certificateSha256: '1888362243640142e26a2c65ee7f084ff55e41bc5452aaf41771be682c007b9e',
  },
  {
    id: 4610,
    qualificacaoId: 141,
    code: 'PT6C-67C',
    completion: '2022-04-06',
    currentExpiry: '2024-04-06',
    targetExpiry: '2025-04-06',
    certificateSha256: 'a3251e165e11f8f326a8147cc237dee73107cc71c1c927655be95d19f96d2fe8',
  },
  {
    id: 4628,
    qualificacaoId: 23,
    code: 'D2',
    completion: '2021-11-03',
    currentExpiry: '2023-11-03',
    targetExpiry: '2024-11-03',
    certificateSha256: '01d549e5159f2133c26c1f6c6c465d1c47fcfc0ac740e8d9413c549720b01cee',
  },
  {
    id: 4632,
    qualificacaoId: 23,
    code: 'D2',
    completion: '2023-01-04',
    currentExpiry: '2025-01-04',
    targetExpiry: '2026-01-04',
    certificateSha256: '0fdfcb53d742c844a6f54cc0daa4bfe3e0beac7756f214723064cdec8712b66c',
  },
  {
    id: 4634,
    qualificacaoId: 23,
    code: 'D2',
    completion: '2022-03-11',
    currentExpiry: '2024-03-11',
    targetExpiry: '2025-03-11',
    certificateSha256: 'dc11092d1083bb89a7992eae0a987433e9decf7064664033332b654810679339',
  },
  {
    id: 4670,
    qualificacaoId: 23,
    code: 'D2',
    completion: '2021-10-21',
    currentExpiry: '2023-10-21',
    targetExpiry: '2024-10-21',
    certificateSha256: '60d65717af296678f2933537fbf2c730d53ed2facea70e652be276a76cd6b0c1',
  },
]);

function fail(code) {
  console.error(`F4_03_REPAIR_ERROR:${code}`);
  process.exit(1);
}

const mode = process.argv[2] || process.env.F4_03_REPAIR_MODE || 'dry-run';
if (!['dry-run', 'apply'].includes(mode)) fail('INVALID_MODE');

const confirmation = process.env.F4_03_REPAIR_CONFIRMATION || '';
if (mode === 'dry-run' && confirmation !== CONFIRMATION_DRY_RUN) fail('DRYRUN_CONFIRMATION_REQUIRED');
if (mode === 'apply' && confirmation !== CONFIRMATION_APPLY) fail('APPLY_CONFIRMATION_REQUIRED');
if ((process.env.F4_03_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');

function runWrangler(sql, label) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--env', 'production', '--remote', '--json', '--command', sql],
    {
      cwd: new URL('../../worker-airtrust/', import.meta.url),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    console.error(`D1_OPERATION_FAILED:${label}:exit=${result.status ?? 'null'}`);
    fail('D1_OPERATION_FAILED');
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch {
    fail('D1_JSON_INVALID');
  }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) fail('D1_RESULTS_MISSING');
  return envelope;
}

function select(sql, label) {
  const normalized = String(sql || '').trim().replace(/;+\s*$/, '').trim();
  if (!/^SELECT\b/i.test(normalized)) fail('NON_SELECT_PREFLIGHT_REJECTED');
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX|ANALYZE)\b/i.test(normalized)) {
    fail('MUTATING_PREFLIGHT_REJECTED');
  }
  return runWrangler(normalized, label).results;
}

function validateCertificateEvidence() {
  const evidencePath = process.env.F4_03_CERTIFICATE_EVIDENCE_PATH;
  if (!evidencePath) fail('CERTIFICATE_EVIDENCE_PATH_REQUIRED');

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  } catch {
    fail('CERTIFICATE_EVIDENCE_INVALID');
  }
  if (!Array.isArray(evidence?.recovered)) fail('CERTIFICATE_RECOVERED_SET_MISSING');

  const byId = new Map(evidence.recovered.map((row) => [Number(row.historico_id), row]));
  for (const target of TARGETS) {
    const row = byId.get(target.id);
    if (!row) fail(`CERTIFICATE_EVIDENCE_MISSING_ID_${target.id}`);
    if (Number(row.empresa_id) !== EMPRESA_ID) fail(`CERTIFICATE_TENANT_MISMATCH_${target.id}`);
    if (Number(row.qualificacao_id) !== target.qualificacaoId) fail(`CERTIFICATE_QUALIFICATION_ID_MISMATCH_${target.id}`);
    if (String(row.qualification_code || '') !== target.code) fail(`CERTIFICATE_CODE_MISMATCH_${target.id}`);
    if (String(row.data_conclusao || '').slice(0, 10) !== target.completion) fail(`CERTIFICATE_COMPLETION_MISMATCH_${target.id}`);
    if (String(row.certificate_expiry || '').slice(0, 10) !== target.targetExpiry) fail(`CERTIFICATE_EXPIRY_MISMATCH_${target.id}`);
    if (String(row.certificate_sha256 || '').toLowerCase() !== target.certificateSha256) fail(`CERTIFICATE_HASH_MISMATCH_${target.id}`);
    if (!row.certificate_created_at || String(row.certificate_created_at) >= INCIDENT_AT) {
      fail(`CERTIFICATE_NOT_PREINCIDENT_${target.id}`);
    }
  }
}

validateCertificateEvidence();

const targetIds = TARGETS.map((t) => t.id).join(',');
const preflight = select(
  `SELECT
      qh.id,
      qh.empresa_id,
      qh.qualificacao_id,
      COALESCE(qt.codigo, 'UNKNOWN') AS qualification_code,
      qh.data_conclusao,
      qh.data_vencimento,
      qh.origem_tipo,
      qh.lms_matricula_id,
      CASE WHEN qh.deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted
    FROM qualificacoes_historico qh
    JOIN qualificacoes_tipos qt
      ON qt.id = qh.qualificacao_id
     AND qt.deleted_at IS NULL
    WHERE qh.id IN (${targetIds})
    ORDER BY qh.id`,
  'preflight_exact_rows',
);

if (preflight.length !== TARGETS.length) {
  fail(`PREFLIGHT_ROW_COUNT_MISMATCH_EXPECTED_${TARGETS.length}_FOUND_${preflight.length}`);
}

const preflightById = new Map(preflight.map((row) => [Number(row.id), row]));
for (const target of TARGETS) {
  const row = preflightById.get(target.id);
  if (!row) fail(`PREFLIGHT_ID_MISSING_${target.id}`);
  if (Number(row.empresa_id) !== EMPRESA_ID) fail(`PREFLIGHT_TENANT_MISMATCH_${target.id}`);
  if (Number(row.qualificacao_id) !== target.qualificacaoId) fail(`PREFLIGHT_QUALIFICATION_ID_MISMATCH_${target.id}`);
  if (String(row.qualification_code || '') !== target.code) fail(`PREFLIGHT_CODE_MISMATCH_${target.id}`);
  if (String(row.data_conclusao || '').slice(0, 10) !== target.completion) fail(`PREFLIGHT_COMPLETION_MISMATCH_${target.id}`);
  if (String(row.data_vencimento || '').slice(0, 10) !== target.currentExpiry) fail(`PREFLIGHT_CURRENT_EXPIRY_MISMATCH_${target.id}`);
  if (String(row.origem_tipo || '') !== 'MANUAL') fail(`PREFLIGHT_ORIGIN_MISMATCH_${target.id}`);
  if (row.lms_matricula_id != null) fail(`PREFLIGHT_LMS_LINK_UNEXPECTED_${target.id}`);
  if (Number(row.soft_deleted) !== 0) fail(`PREFLIGHT_SOFT_DELETED_${target.id}`);
}

const summary = {
  mode,
  source_sha: process.env.GITHUB_SHA || null,
  empresa_id: EMPRESA_ID,
  target_ids: TARGETS.map((t) => t.id),
  preflight_verified: true,
  certificate_evidence_verified: true,
  mutation_executed: false,
  changed_rows: 0,
  before_after: TARGETS.map((t) => ({
    historico_id: t.id,
    qualification_code: t.code,
    current_expiry: t.currentExpiry,
    target_expiry: t.targetExpiry,
  })),
  writes: 0,
  pii_emitted: false,
};

if (mode === 'dry-run') {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

const cases = TARGETS.map((t) => `WHEN ${t.id} THEN '${t.targetExpiry}'`).join(' ');
const guards = TARGETS.map(
  (t) =>
    `(id = ${t.id} AND qualificacao_id = ${t.qualificacaoId} AND data_conclusao = '${t.completion}' AND data_vencimento = '${t.currentExpiry}')`,
).join(' OR ');

const updateSql =
  `UPDATE qualificacoes_historico ` +
  `SET data_vencimento = CASE id ${cases} ELSE data_vencimento END ` +
  `WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL ` +
  `AND origem_tipo = 'MANUAL' AND lms_matricula_id IS NULL ` +
  `AND (${guards})`;

const updateEnvelope = runWrangler(updateSql, 'apply_exact_six_rows');
const changes = Number(updateEnvelope.meta?.changes ?? 0);
if (changes !== TARGETS.length) {
  fail(`APPLY_CHANGE_COUNT_MISMATCH_EXPECTED_${TARGETS.length}_FOUND_${changes}`);
}

const post = select(
  `SELECT id, empresa_id, qualificacao_id, data_conclusao, data_vencimento,
          origem_tipo, lms_matricula_id,
          CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted
     FROM qualificacoes_historico
    WHERE id IN (${targetIds})
    ORDER BY id`,
  'post_exact_rows',
);

if (post.length !== TARGETS.length) fail('POST_ROW_COUNT_MISMATCH');
const postById = new Map(post.map((row) => [Number(row.id), row]));
for (const target of TARGETS) {
  const row = postById.get(target.id);
  if (!row) fail(`POST_ID_MISSING_${target.id}`);
  if (Number(row.empresa_id) !== EMPRESA_ID) fail(`POST_TENANT_MISMATCH_${target.id}`);
  if (Number(row.qualificacao_id) !== target.qualificacaoId) fail(`POST_QUALIFICATION_ID_MISMATCH_${target.id}`);
  if (String(row.data_conclusao || '').slice(0, 10) !== target.completion) fail(`POST_COMPLETION_MISMATCH_${target.id}`);
  if (String(row.data_vencimento || '').slice(0, 10) !== target.targetExpiry) fail(`POST_TARGET_EXPIRY_MISMATCH_${target.id}`);
  if (String(row.origem_tipo || '') !== 'MANUAL') fail(`POST_ORIGIN_MISMATCH_${target.id}`);
  if (row.lms_matricula_id != null) fail(`POST_LMS_LINK_UNEXPECTED_${target.id}`);
  if (Number(row.soft_deleted) !== 0) fail(`POST_SOFT_DELETED_${target.id}`);
}

summary.mutation_executed = true;
summary.changed_rows = changes;
summary.writes = 1;
summary.postconditions_verified = true;
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
