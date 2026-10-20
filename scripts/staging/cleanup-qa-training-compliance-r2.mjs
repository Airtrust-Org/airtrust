#!/usr/bin/env node
// source_reference: AirTrust F1 staging lifecycle synthetic PDF cleanup (#1492).
// operational_decision: STAGING_ONLY. Never enumerate/delete broad R2 prefixes.
// dry_run_required: default reads exact QA-owned D1 documents and does not mutate R2.
// rollback_plan_required: --apply deletes only validated QA PDF keys, verifies absence,
//   then the caller always runs the SQL fixture rollback; archived D1 evidence is immutable.
import { spawnSync } from 'node:child_process';

export const QA_TENANT = 'qa_examiner_training';
export const QA_DB = 'airtrust-db-staging-baseline-20260701';
export const QA_BUCKET = 'airtrust-storage-staging';
export const QA_CONFIRM = 'AIRTRUST_STAGING_TRAINING_COMPLIANCE_LIFECYCLE_QA';

export function assertRunIdentity(code, marker) {
  if (!/^QA-COMP-LIFE-[0-9]{3,32}$/.test(code)) throw Error('QA_LIFECYCLE_CODE_INVALID');
  if (!/^QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_[0-9]{3,32}$/.test(marker))
    throw Error('QA_LIFECYCLE_MARKER_INVALID');
  if (code.slice('QA-COMP-LIFE-'.length) !==
      marker.slice('QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_'.length))
    throw Error('QA_RUN_ID_MISMATCH');
}

export function ownedPdfKey(row, code) {
  const tenant = Number(row.empresa_id);
  const employee = Number(row.funcionario_id);
  const history = Number(row.historico_id);
  const document = Number(row.documento_id);
  if (![tenant, employee, history, document].every(n => Number.isSafeInteger(n) && n > 0))
    throw Error('QA_PDF_SCOPE_INVALID');
  if (row.tenant_code !== QA_TENANT ||
      ![code + '-E1', code + '-E2'].includes(row.employee_code) ||
      row.course_marker !== row.expected_marker ||
      !/^QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_[0-9]{3,32}$/.test(row.expected_marker))
    throw Error('QA_PDF_OWNER_MISMATCH');
  const prefix = `certificados/empresa-${tenant}/funcionario-${employee}/historico-${history}/`;
  const key = String(row.r2_key || '');
  const uuid = key.slice(prefix.length);
  if (!key.startsWith(prefix) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(uuid))
    throw Error('QA_PDF_KEY_REJECTED');
  return key;
}

export function buildOwnedPdfSql(code, marker) {
  assertRunIdentity(code, marker);
  // The same employee, enrollment, course marker and qualification must own
  // the certificate. Never select all documents under the QA tenant or R2 prefix.
  return `SELECT d.id AS documento_id,d.r2_key,h.id AS historico_id,
    f.id AS funcionario_id,f.matricula AS employee_code,
    e.id AS empresa_id,e.codigo AS tenant_code,
    c.observacoes AS course_marker,'${marker}' AS expected_marker
  FROM documentos d
  JOIN funcionarios f ON f.id=d.funcionario_id AND f.empresa_id=d.empresa_id
  JOIN empresas e ON e.id=f.empresa_id AND e.codigo='${QA_TENANT}'
  JOIN qualificacoes_historico h ON h.certificado_arquivo_id=d.id
    AND h.empresa_id=e.id AND h.funcionario_id=f.id
  JOIN lms_matriculas m ON m.id=h.lms_matricula_id AND m.empresa_id=e.id
    AND m.funcionario_id=f.id
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=e.id
    AND c.observacoes='${marker}'
  WHERE d.empresa_id=e.id AND f.matricula IN ('${code}-E1','${code}-E2')
    AND h.qualificacao_id=c.qualificacao_tipo_id
    AND d.tipo='application/pdf'
  ORDER BY d.id LIMIT 17;`;
}

export async function cleanupOwnedPdfs(rows, code, marker, storage, apply = false) {
  assertRunIdentity(code, marker);
  if (!Array.isArray(rows) || rows.length > 16) throw Error('QA_PDF_COUNT_REJECTED');
  const keys = rows.map(row => ownedPdfKey(row, code));
  if (new Set(keys).size !== keys.length) throw Error('QA_PDF_DUPLICATE_KEY');
  // Validate EVERY candidate before the first write. Dry-run never invokes storage.
  if (!apply) return { checked: keys.length, deleted: 0, dryRun: true };
  let deleted = 0;
  for (const key of keys) {
    if (await storage.exists(key)) {
      await storage.delete(key);
      deleted++;
    }
    if (await storage.exists(key)) throw Error('QA_R2_DELETE_READBACK_FAILED');
  }
  return { checked: keys.length, deleted, dryRun: false };
}

function queryStagingD1(sql) {
  const run = spawnSync('npx',
    ['wrangler','d1','execute',QA_DB,'--remote','--json',`--command=${sql}`],
    {cwd: new URL('../../worker-airtrust/', import.meta.url), encoding:'utf8',
     env:process.env, maxBuffer:4 * 1024 * 1024});
  if (run.status !== 0) throw Error('QA_D1_READ_FAILED');
  let json;
  try { json = JSON.parse(run.stdout); } catch { throw Error('QA_D1_JSON_INVALID'); }
  const results = Array.isArray(json) ? json[0]?.results : json?.results;
  if (!Array.isArray(results)) throw Error('QA_D1_ROWS_INVALID');
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const code = (args.find(v => v.startsWith('--code=')) || '').slice(7);
  const marker = (args.find(v => v.startsWith('--marker=')) || '').slice(9);
  const apply = args.includes('--apply');
  assertRunIdentity(code, marker);
  if (process.env.STAGING_D1_NAME && process.env.STAGING_D1_NAME !== QA_DB)
    throw Error('QA_D1_TARGET_REJECTED');
  if (apply && process.env.CONFIRM_STAGING_COMPLIANCE_LIFECYCLE_QA !== QA_CONFIRM)
    throw Error('QA_R2_CONFIRMATION_REQUIRED');
  const rows = queryStagingD1(buildOwnedPdfSql(code, marker));
  if (!apply) {
    console.log(JSON.stringify(await cleanupOwnedPdfs(rows, code, marker, null, false)));
    return;
  }
  const accessKeyId=process.env.QA_LIFECYCLE_R2_ACCESS_KEY_ID;
  const secretAccessKey=process.env.QA_LIFECYCLE_R2_SECRET_ACCESS_KEY;
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accessKeyId || !secretAccessKey || !/^[a-f0-9]{32}$/.test(account || ''))
    throw Error('QA_R2_DEDICATED_CREDENTIALS_REQUIRED');
  const { S3Client, HeadObjectCommand, DeleteObjectCommand } =
    await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region:'auto', endpoint:`https://${account}.r2.cloudflarestorage.com`,
    credentials:{accessKeyId,secretAccessKey},
  });
  const exists = async key => {
    try { await client.send(new HeadObjectCommand({Bucket:QA_BUCKET,Key:key})); return true; }
    catch(e) {
      if (e?.name === 'NotFound' || e?.name === 'NoSuchKey' ||
          Number(e?.$metadata?.httpStatusCode) === 404) return false;
      throw Error('QA_R2_HEAD_FAILED');
    }
  };
  try {
    const result = await cleanupOwnedPdfs(rows, code, marker, {
      exists, delete: async key => {
        await client.send(new DeleteObjectCommand({Bucket:QA_BUCKET,Key:key}));
      },
    }, true);
    console.log(JSON.stringify({result:'PASS',...result}));
  } finally { client.destroy(); }
}

if (process.argv[1] && /cleanup-qa-training-compliance-r2\.mjs$/.test(process.argv[1])) {
  main().catch(e => { console.error(String(e?.message || e)); process.exitCode=1; });
}
