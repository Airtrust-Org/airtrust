// source_reference: 2026-09-29 production RBAC incident; reviewed tenant admin has only a subset of active setores_gestores assignments and therefore cannot perform operational writes outside those sectors.
// operational_decision: preserve ADMIN role/profile and all existing manager assignments; add only missing active sector assignments for the explicitly reviewed target user in tenant 6.
// dry_run_required: production apply requires a successful reviewed dry-run on the exact same SHA, target and candidate count/hash.
// rollback_plan_required: workflow captures a D1 Time Travel recovery point immediately before apply; this repair only inserts missing setor assignments and never deletes or broadens cross-tenant access.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const DRY_CONFIRM = 'AIRTRUST_PRODUCTION_DRYRUN_ADMIN_ALL_SECTOR_ACCESS_20260929';
const APPLY_CONFIRM = 'AIRTRUST_PRODUCTION_APPLY_ADMIN_ALL_SECTOR_ACCESS_20260929';
const mode = process.argv[2] || process.env.ADMIN_SECTOR_RECONCILIATION_MODE || 'dry-run';

function fail(code) {
  console.error(`ADMIN_SECTOR_RECONCILIATION_ERROR:${code}`);
  process.exit(1);
}

if (!['dry-run', 'apply'].includes(mode)) fail('INVALID_MODE');
if ((process.env.ADMIN_SECTOR_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');

const rawTarget = String(process.env.ADMIN_SECTOR_TARGET_USER_ID || '').trim();
if (!/^[1-9][0-9]*$/.test(rawTarget)) fail('TARGET_USER_ID_REQUIRED');
const TARGET_USER_ID = Number(rawTarget);
if (!Number.isSafeInteger(TARGET_USER_ID) || TARGET_USER_ID <= 0) fail('TARGET_USER_ID_INVALID');

const confirmation = process.env.ADMIN_SECTOR_RECONCILIATION_CONFIRMATION || '';
if (mode === 'dry-run' && confirmation !== DRY_CONFIRM) fail('DRYRUN_CONFIRMATION_REQUIRED');
if (mode === 'apply' && confirmation !== APPLY_CONFIRM) fail('APPLY_CONFIRMATION_REQUIRED');

function runWrangler(sql, label) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--env', 'production', '--remote', '--json', '--command', sql],
    {
      cwd: new URL('../../worker-airtrust/', import.meta.url),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    console.error(`D1_OPERATION_FAILED:${label}:exit=${result.status ?? 'null'}`);
    process.stderr.write(result.stderr || '');
    fail('D1_OPERATION_FAILED');
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch {
    fail(`D1_JSON_INVALID_${label}`);
  }
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  if (!envelopes.length || envelopes.some((envelope) => !envelope || !Array.isArray(envelope.results))) {
    fail(`D1_RESULTS_MISSING_${label}`);
  }
  return envelopes;
}

function select(sql, label) {
  const normalized = String(sql).trim().replace(/;+\s*$/, '');
  if (!/^(SELECT|WITH)\b/i.test(normalized)) fail(`NON_SELECT_${label}`);
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX)\b/i.test(normalized)) {
    fail(`MUTATING_PREFLIGHT_${label}`);
  }
  const envelopes = runWrangler(normalized, label);
  return envelopes[0].results;
}

function hashStrings(values) {
  return createHash('sha256').update([...values].sort().join('\n')).digest('hex');
}

function readState() {
  const membership = select(
    `SELECT lower(COALESCE(ue.role,'')) AS role
       FROM usuarios u
       JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=${EMPRESA_ID}
      WHERE u.id=${TARGET_USER_ID}
        AND u.deleted_at IS NULL
      LIMIT 1`,
    'target_membership',
  );
  if (membership.length !== 1) fail('TARGET_MEMBERSHIP_NOT_UNIQUE');
  if (String(membership[0]?.role || '') !== 'admin') fail('TARGET_NOT_ADMIN');

  const profile = select(
    `SELECT COUNT(*) AS n
       FROM usuarios_empresas_perfis
      WHERE usuario_id=${TARGET_USER_ID}
        AND empresa_id=${EMPRESA_ID}
        AND ativo=1
        AND upper(perfil)='ADMIN'`,
    'target_admin_profile',
  );
  if (Number(profile[0]?.n || 0) !== 1) fail('TARGET_ADMIN_PROFILE_MISSING');

  const schemaReady = select(
    `SELECT COUNT(*) AS n FROM pragma_table_info('setores_gestores') WHERE name='usuario_id'`,
    'setores_gestores_schema',
  );
  if (Number(schemaReady[0]?.n || 0) !== 1) fail('SETORES_GESTORES_USUARIO_ID_MISSING');

  const activeSectors = select(
    `SELECT id
       FROM setores
      WHERE empresa_id=${EMPRESA_ID}
        AND ativo=1
        AND deleted_at IS NULL
      ORDER BY id`,
    'active_sectors',
  ).map((row) => Number(row.id));
  if (!activeSectors.length || activeSectors.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    fail('ACTIVE_SECTOR_SET_INVALID');
  }

  const assigned = select(
    `SELECT DISTINCT sg.setor_id AS id
       FROM setores_gestores sg
       JOIN setores s ON s.id=sg.setor_id AND s.empresa_id=sg.empresa_id
      WHERE sg.usuario_id=${TARGET_USER_ID}
        AND sg.empresa_id=${EMPRESA_ID}
        AND sg.ativo=1
        AND sg.deleted_at IS NULL
        AND s.ativo=1
        AND s.deleted_at IS NULL
      ORDER BY sg.setor_id`,
    'active_assignments',
  ).map((row) => Number(row.id));

  const assignedSet = new Set(assigned);
  const missing = activeSectors.filter((id) => !assignedSet.has(id));
  const signatures = missing.map((sectorId) => `target:${TARGET_USER_ID}:assign-sector:${sectorId}`);

  return {
    activeSectors,
    assigned,
    missing,
    candidateCount: signatures.length,
    candidateHash: hashStrings(signatures),
  };
}

const before = readState();
const summary = {
  mode,
  source_sha: process.env.GITHUB_SHA || null,
  empresa_id: EMPRESA_ID,
  active_sectors: before.activeSectors.length,
  existing_active_assignments: before.assigned.length,
  missing_active_assignments: before.missing.length,
  candidate_count: before.candidateCount,
  candidate_hash: before.candidateHash,
  target_admin_role_verified: true,
  target_admin_profile_verified: true,
  mutation_executed: false,
  postconditions_verified: false,
  pii_emitted: false,
};

if (mode === 'dry-run') {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

const expectedCount = Number(process.env.ADMIN_SECTOR_EXPECTED_COUNT || -1);
const expectedHash = String(process.env.ADMIN_SECTOR_EXPECTED_HASH || '').toLowerCase();
if (!Number.isInteger(expectedCount) || expectedCount <= 0) fail('EXPECTED_COUNT_REQUIRED');
if (!/^[0-9a-f]{64}$/.test(expectedHash)) fail('EXPECTED_HASH_REQUIRED');
if (before.candidateCount !== expectedCount) fail(`CANDIDATE_COUNT_CHANGED_EXPECTED_${expectedCount}_FOUND_${before.candidateCount}`);
if (before.candidateHash !== expectedHash) fail('CANDIDATE_SET_CHANGED');

// A single remote D1 command carries both statements. The first records the exact
// missing-sector set; the second creates only those still absent at execution time.
// No existing row is updated/deleted and no other user's assignments are touched.
runWrangler(
  `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
   SELECT NULL,'ADMIN_ALL_SECTOR_ACCESS_RECONCILIATION_20260929','setores_gestores',s.id,
          '{"assigned":false}',
          '{"assigned":true,"reason":"reviewed_admin_all_sector_access_reconciliation"}',
          ${EMPRESA_ID},datetime('now')
     FROM setores s
    WHERE s.empresa_id=${EMPRESA_ID}
      AND s.ativo=1
      AND s.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM setores_gestores sg
         WHERE sg.empresa_id=${EMPRESA_ID}
           AND sg.usuario_id=${TARGET_USER_ID}
           AND sg.setor_id=s.id
           AND sg.ativo=1
           AND sg.deleted_at IS NULL
      );
   INSERT INTO setores_gestores
          (setor_id,gestor_id,usuario_id,empresa_id,role,ativo,created_at,updated_at,deleted_at)
   SELECT s.id,NULL,${TARGET_USER_ID},${EMPRESA_ID},'manager',1,datetime('now'),datetime('now'),NULL
     FROM setores s
    WHERE s.empresa_id=${EMPRESA_ID}
      AND s.ativo=1
      AND s.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM setores_gestores sg
         WHERE sg.empresa_id=${EMPRESA_ID}
           AND sg.usuario_id=${TARGET_USER_ID}
           AND sg.setor_id=s.id
           AND sg.ativo=1
           AND sg.deleted_at IS NULL
      );`,
  'apply_missing_sector_assignments',
);

const after = readState();
if (after.missing.length !== 0) fail(`POST_MISSING_ACTIVE_ASSIGNMENTS_${after.missing.length}`);
if (after.assigned.length !== after.activeSectors.length) fail('POST_ACTIVE_ASSIGNMENT_COUNT_MISMATCH');

Object.assign(summary, {
  mutation_executed: true,
  postconditions_verified: true,
  post_active_sectors: after.activeSectors.length,
  post_active_assignments: after.assigned.length,
  post_missing_active_assignments: after.missing.length,
});
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
