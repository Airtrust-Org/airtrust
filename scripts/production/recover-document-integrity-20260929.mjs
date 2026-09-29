// source_reference: incident inventory 2026-09-29 for tenant 6; 7 reviewed supporting-document rows retain verified R2 objects, 2 reviewed rows have missing primary/full-backup R2 objects, and only non-current AirTrust-generated certificates are cleanup candidates.
// operational_decision: restore only the seven immutable reviewed supporting documents and retire only provably auto-generated non-current certificate rows/mirrors; preserve all manual/legacy documents and current certificate links.
// dry_run_required: production apply requires a successful reviewed dry-run on the exact same SHA plus exact candidate count/hash.
// rollback_plan_required: workflow captures a D1 Time Travel recovery point immediately before apply; all mutations are reversible soft-delete/undelete operations and no R2 object is deleted.
// Production-only, tenant-scoped deterministic repair for the 2026-09-29
// document-integrity incident. It never deletes R2 objects.
//
// Contract:
// - restore only the seven reviewed ANAC/CHT/extract document rows whose R2
//   objects were verified to still exist before this repair was prepared;
// - keep the two reviewed rows whose objects are missing soft-deleted;
// - retire only non-current certificates that are provably AirTrust-generated;
// - retire stale pasta_virtual mirrors of already-soft-deleted auto certificates;
// - preserve every manual/legacy document and every current certificate link;
// - dry-run first; apply requires the exact candidate count/hash from that run.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const RESTORE_DOC_IDS = [346, 347, 348, 501, 2001, 2005, 2020];
const KNOWN_MISSING_R2_DOC_IDS = [500, 1520];
const DRY_CONFIRM = 'AIRTRUST_PRODUCTION_DRYRUN_DOCUMENT_INTEGRITY_RECOVERY_20260929';
const APPLY_CONFIRM = 'AIRTRUST_PRODUCTION_APPLY_DOCUMENT_INTEGRITY_RECOVERY_20260929';
const mode = process.argv[2] || process.env.DOCUMENT_INTEGRITY_RECOVERY_MODE || 'dry-run';

function fail(code) {
  console.error(`DOCUMENT_INTEGRITY_RECOVERY_ERROR:${code}`);
  process.exit(1);
}

if (!['dry-run', 'apply'].includes(mode)) fail('INVALID_MODE');
if ((process.env.DOCUMENT_INTEGRITY_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) {
  fail('PRODUCTION_DB_TARGET_REJECTED');
}
const confirmation = process.env.DOCUMENT_INTEGRITY_RECOVERY_CONFIRMATION || '';
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
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) fail(`D1_RESULTS_MISSING_${label}`);
  return envelope;
}

function select(sql, label) {
  const normalized = String(sql).trim().replace(/;+\s*$/, '');
  if (!/^(SELECT|WITH)\b/i.test(normalized)) fail(`NON_SELECT_${label}`);
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX)\b/i.test(normalized)) {
    fail(`MUTATING_PREFLIGHT_${label}`);
  }
  return runWrangler(normalized, label).results;
}

function idsSql(ids) {
  if (!ids.length) return 'NULL';
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) fail('INVALID_ID_SET');
  return ids.join(',');
}

function hashStrings(values) {
  return createHash('sha256').update([...values].sort().join('\n')).digest('hex');
}

const RESTORE_IDS_SQL = idsSql(RESTORE_DOC_IDS);
const MISSING_IDS_SQL = idsSql(KNOWN_MISSING_R2_DOC_IDS);
const AUTO_DESCRIPTION = "d.descricao LIKE 'Certificado automático gerado em %'";
const SUPPORTING_DOC_FILTER = `(
  lower(COALESCE(d.descricao,'')) LIKE '%extrato%'
  OR lower(COALESCE(d.descricao,'')) LIKE '%cht%'
  OR lower(COALESCE(d.descricao,'')) LIKE '%anac%'
  OR lower(COALESCE(d.nome_arquivo,'')) LIKE '%extrato%'
  OR lower(COALESCE(d.nome_arquivo,'')) LIKE '%cht%'
  OR lower(COALESCE(d.nome_arquivo,'')) LIKE '%anac%'
)`;

function readState() {
  const restoreRows = select(
    `SELECT d.id
       FROM documentos d
      WHERE d.empresa_id=${EMPRESA_ID}
        AND d.id IN (${RESTORE_IDS_SQL})
        AND d.deleted_at IS NOT NULL
        AND NOT (${AUTO_DESCRIPTION})
        AND ${SUPPORTING_DOC_FILTER}
      ORDER BY d.id`,
    'restore_rows',
  );

  const missingRows = select(
    `SELECT d.id
       FROM documentos d
      WHERE d.empresa_id=${EMPRESA_ID}
        AND d.id IN (${MISSING_IDS_SQL})
        AND d.deleted_at IS NOT NULL
      ORDER BY d.id`,
    'known_missing_rows',
  );

  const extraAutoDocs = select(
    `SELECT DISTINCT d.id AS doc_id, pv.id AS pv_id
       FROM pasta_virtual pv
       JOIN qualificacoes_historico qh
         ON qh.id=pv.certificacao_id
        AND qh.empresa_id=pv.empresa_id
        AND qh.deleted_at IS NULL
       JOIN documentos d
         ON d.empresa_id=pv.empresa_id
        AND d.funcionario_id=pv.funcionario_id
        AND d.r2_key=pv.caminho_arquivo
      WHERE pv.empresa_id=${EMPRESA_ID}
        AND pv.deleted_at IS NULL
        AND pv.tipo_documento='CERTIFICADO'
        AND d.deleted_at IS NULL
        AND ${AUTO_DESCRIPTION}
        AND d.id<>qh.certificado_arquivo_id
      ORDER BY d.id,pv.id`,
    'extra_auto_docs',
  );

  const staleAutoMirrors = select(
    `SELECT DISTINCT pv.id AS pv_id
       FROM pasta_virtual pv
       JOIN qualificacoes_historico qh
         ON qh.id=pv.certificacao_id
        AND qh.empresa_id=pv.empresa_id
        AND qh.deleted_at IS NULL
       JOIN documentos d
         ON d.empresa_id=pv.empresa_id
        AND d.funcionario_id=pv.funcionario_id
        AND d.r2_key=pv.caminho_arquivo
      WHERE pv.empresa_id=${EMPRESA_ID}
        AND pv.deleted_at IS NULL
        AND pv.tipo_documento='CERTIFICADO'
        AND d.deleted_at IS NOT NULL
        AND ${AUTO_DESCRIPTION}
      ORDER BY pv.id`,
    'stale_auto_mirrors',
  );

  const protectedManual = select(
    `SELECT pv.id
       FROM pasta_virtual pv
       LEFT JOIN documentos d
         ON d.empresa_id=pv.empresa_id
        AND d.funcionario_id=pv.funcionario_id
        AND d.r2_key=pv.caminho_arquivo
      WHERE pv.empresa_id=${EMPRESA_ID}
        AND pv.deleted_at IS NULL
        AND pv.tipo_documento='CERTIFICADO'
        AND (d.id IS NULL OR NOT (${AUTO_DESCRIPTION}))
      ORDER BY pv.id`,
    'protected_manual',
  );

  const brokenCurrent = select(
    `SELECT COUNT(*) AS n
       FROM qualificacoes_historico qh
       LEFT JOIN documentos d
         ON d.id=qh.certificado_arquivo_id
        AND d.empresa_id=qh.empresa_id
      WHERE qh.empresa_id=${EMPRESA_ID}
        AND qh.deleted_at IS NULL
        AND qh.certificado_arquivo_id IS NOT NULL
        AND (d.id IS NULL OR d.deleted_at IS NOT NULL)`,
    'broken_current',
  );

  const restoreIds = restoreRows.map((row) => Number(row.id)).sort((a, b) => a - b);
  const missingIds = missingRows.map((row) => Number(row.id)).sort((a, b) => a - b);
  const extraDocIds = [...new Set(extraAutoDocs.map((row) => Number(row.doc_id)))].sort((a, b) => a - b);
  const extraPvIds = [...new Set(extraAutoDocs.map((row) => Number(row.pv_id)))].sort((a, b) => a - b);
  const stalePvIds = [...new Set(staleAutoMirrors.map((row) => Number(row.pv_id)))].sort((a, b) => a - b);
  const protectedPvIds = protectedManual.map((row) => Number(row.id)).sort((a, b) => a - b);
  const allCleanupPvIds = [...new Set([...extraPvIds, ...stalePvIds])].sort((a, b) => a - b);
  const signatures = [
    ...restoreIds.map((id) => `restore-doc:${id}`),
    ...extraDocIds.map((id) => `retire-auto-doc:${id}`),
    ...allCleanupPvIds.map((id) => `retire-auto-pv:${id}`),
  ];

  return {
    restoreIds,
    missingIds,
    extraDocIds,
    allCleanupPvIds,
    protectedPvIds,
    brokenCurrentCount: Number(brokenCurrent[0]?.n || 0),
    candidateCount: signatures.length,
    candidateHash: hashStrings(signatures),
  };
}

const before = readState();
if (before.restoreIds.length !== RESTORE_DOC_IDS.length) fail(`RESTORE_SET_DRIFT_${before.restoreIds.length}`);
if (before.restoreIds.some((id, i) => id !== RESTORE_DOC_IDS[i])) fail('RESTORE_IDS_CHANGED');
if (before.missingIds.length !== KNOWN_MISSING_R2_DOC_IDS.length) fail('KNOWN_MISSING_SET_DRIFT');
if (before.brokenCurrentCount !== 0) fail(`BROKEN_CURRENT_CERTIFICATE_LINKS_${before.brokenCurrentCount}`);

const summary = {
  mode,
  source_sha: process.env.GITHUB_SHA || null,
  empresa_id: EMPRESA_ID,
  restore_documents: before.restoreIds.length,
  known_missing_r2_documents: before.missingIds.length,
  extra_auto_documents: before.extraDocIds.length,
  stale_or_extra_auto_folder_rows: before.allCleanupPvIds.length,
  protected_manual_or_legacy_folder_rows: before.protectedPvIds.length,
  broken_current_certificate_links: before.brokenCurrentCount,
  candidate_count: before.candidateCount,
  candidate_hash: before.candidateHash,
  mutation_executed: false,
  postconditions_verified: false,
  pii_emitted: false,
};

if (mode === 'dry-run') {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

const expectedCount = Number(process.env.DOCUMENT_INTEGRITY_EXPECTED_COUNT || 0);
const expectedHash = String(process.env.DOCUMENT_INTEGRITY_EXPECTED_HASH || '').toLowerCase();
if (!Number.isInteger(expectedCount) || expectedCount <= 0) fail('EXPECTED_COUNT_REQUIRED');
if (!/^[0-9a-f]{64}$/.test(expectedHash)) fail('EXPECTED_HASH_REQUIRED');
if (before.candidateCount !== expectedCount) {
  fail(`CANDIDATE_COUNT_CHANGED_EXPECTED_${expectedCount}_FOUND_${before.candidateCount}`);
}
if (before.candidateHash !== expectedHash) fail('CANDIDATE_SET_CHANGED');

const cleanupPvSql = idsSql(before.allCleanupPvIds);
const cleanupDocSql = idsSql(before.extraDocIds);
const protectedPvSql = idsSql(before.protectedPvIds);

runWrangler(
  `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
   SELECT NULL,'DOCUMENT_INTEGRITY_RESTORE_20260929','documentos',d.id,
          '{"deleted":true}',
          '{"deleted":false,"reason":"verified_r2_supporting_document_recovery"}',
          ${EMPRESA_ID},datetime('now')
     FROM documentos d
    WHERE d.empresa_id=${EMPRESA_ID} AND d.id IN (${RESTORE_IDS_SQL}) AND d.deleted_at IS NOT NULL`,
  'audit_restore',
);

if (before.extraDocIds.length) {
  runWrangler(
    `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
     SELECT NULL,'DOCUMENT_INTEGRITY_RETIRE_AUTO_DUPLICATE_20260929','documentos',d.id,
            '{"deleted":false}',
            '{"deleted":true,"reason":"non_current_airtrust_generated_certificate"}',
            ${EMPRESA_ID},datetime('now')
       FROM documentos d
      WHERE d.empresa_id=${EMPRESA_ID} AND d.id IN (${cleanupDocSql}) AND d.deleted_at IS NULL`,
    'audit_auto_docs',
  );
}

runWrangler(
  `UPDATE documentos
      SET deleted_at=NULL, updated_at=datetime('now')
    WHERE empresa_id=${EMPRESA_ID}
      AND id IN (${RESTORE_IDS_SQL})
      AND deleted_at IS NOT NULL
      AND NOT (descricao LIKE 'Certificado automático gerado em %')
      AND ${SUPPORTING_DOC_FILTER}`,
  'restore_documents',
);

runWrangler(
  `UPDATE pasta_virtual
      SET deleted_at=NULL, updated_at=datetime('now')
    WHERE empresa_id=${EMPRESA_ID}
      AND deleted_at IS NOT NULL
      AND caminho_arquivo IN (
        SELECT r2_key FROM documentos WHERE empresa_id=${EMPRESA_ID} AND id IN (${RESTORE_IDS_SQL})
      )`,
  'restore_folder_rows',
);

if (before.allCleanupPvIds.length) {
  runWrangler(
    `UPDATE pasta_virtual
        SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
      WHERE empresa_id=${EMPRESA_ID} AND id IN (${cleanupPvSql}) AND deleted_at IS NULL`,
    'retire_auto_folder_rows',
  );
}

if (before.extraDocIds.length) {
  runWrangler(
    `UPDATE documentos
        SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
      WHERE empresa_id=${EMPRESA_ID}
        AND id IN (${cleanupDocSql})
        AND deleted_at IS NULL
        AND descricao LIKE 'Certificado automático gerado em %'`,
    'retire_extra_auto_documents',
  );
}

const restored = select(
  `SELECT COUNT(*) AS n FROM documentos
    WHERE empresa_id=${EMPRESA_ID} AND id IN (${RESTORE_IDS_SQL}) AND deleted_at IS NULL`,
  'post_restored',
);
if (Number(restored[0]?.n || 0) !== RESTORE_DOC_IDS.length) fail('POST_RESTORE_COUNT_MISMATCH');

if (before.protectedPvIds.length) {
  const protectedStillActive = select(
    `SELECT COUNT(*) AS n FROM pasta_virtual
      WHERE empresa_id=${EMPRESA_ID} AND id IN (${protectedPvSql}) AND deleted_at IS NULL`,
    'post_protected_manual',
  );
  if (Number(protectedStillActive[0]?.n || 0) !== before.protectedPvIds.length) {
    fail('PROTECTED_MANUAL_DOCUMENT_CHANGED');
  }
}

const after = readState();
if (after.brokenCurrentCount !== 0) fail(`POST_BROKEN_CURRENT_CERTIFICATE_LINKS_${after.brokenCurrentCount}`);
if (after.extraDocIds.length !== 0) fail(`POST_EXTRA_AUTO_DOCS_REMAIN_${after.extraDocIds.length}`);
if (after.allCleanupPvIds.length !== 0) fail(`POST_STALE_AUTO_FOLDER_ROWS_REMAIN_${after.allCleanupPvIds.length}`);
if (after.missingIds.length !== KNOWN_MISSING_R2_DOC_IDS.length) fail('POST_KNOWN_MISSING_SET_CHANGED');

Object.assign(summary, {
  mutation_executed: true,
  postconditions_verified: true,
  post_restored_documents: Number(restored[0]?.n || 0),
  post_extra_auto_documents: after.extraDocIds.length,
  post_stale_or_extra_auto_folder_rows: after.allCleanupPvIds.length,
  post_broken_current_certificate_links: after.brokenCurrentCount,
});
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
