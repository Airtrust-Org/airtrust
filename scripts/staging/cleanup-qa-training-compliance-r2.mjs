#!/usr/bin/env node
// source_reference: AirTrust F1 staging lifecycle synthetic PDF cleanup (#1492).
// operational_decision: STAGING_ONLY. Never enumerate/delete broad R2 prefixes.
// dry_run_required: default reads exact QA-owned D1 documents and does not mutate R2.
// rollback_plan_required: --apply deletes only validated QA PDF keys, verifies absence,
//   then the caller always runs the SQL fixture rollback; archived D1 evidence is immutable.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

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

// The existing staging Worker API token is scoped by the workflow environment.
// This adapter never enumerates a bucket: every object key is generated from
// an already verified D1 ownership row, or is this run's disposable canary.
const REST_OBJECT_KEY = /^(?:certificados\/empresa-[1-9][0-9]*\/funcionario-[1-9][0-9]*\/historico-[1-9][0-9]*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf|__airtrust_qa_preflight__\/compliance\/[0-9]{3,32}\/capability\.txt)$/i;

export function createCloudflareR2Storage({ accountId, token, fetchImpl = fetch }) {
  if (!/^[0-9a-f]{32}$/.test(String(accountId || '')) || typeof token !== 'string' || !token)
    throw Error('QA_R2_EXISTING_STAGING_TOKEN_REQUIRED');
  if (typeof fetchImpl !== 'function') throw Error('QA_R2_FETCH_INVALID');

  async function request(method, key, body) {
    if (!REST_OBJECT_KEY.test(key)) throw Error('QA_R2_OBJECT_KEY_DENIED');
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + accountId +
      '/r2/buckets/' + QA_BUCKET + '/objects/' + key;
    const headers = { Authorization: 'Bearer ' + token };
    if (method === 'GET') headers.Range = 'bytes=0-0';
    if (method === 'PUT') headers['Content-Type'] = 'text/plain';
    const response = await fetchImpl(url, {
      method, headers, ...(body === undefined ? {} : {body}),
      signal: AbortSignal.timeout(15000),
    });
    // Do not materialize/download a real certificate PDF into memory or logs.
    if (method === 'GET') {
      if (response.body && typeof response.body.cancel === 'function')
        await response.body.cancel();
      if (response.status === 404) return false;
      if (response.status === 200 || response.status === 206) return true;
      throw Error('QA_R2_REST_READ_DENIED');
    }
    if (!response.ok) throw Error('QA_R2_REST_WRITE_DENIED');
    if (response.headers?.get?.('content-type')?.includes('application/json')) {
      let data;
      try { data = await response.json(); } catch { throw Error('QA_R2_REST_RESPONSE_INVALID'); }
      if (data?.success === false) throw Error('QA_R2_REST_RESPONSE_DENIED');
    }
    return true;
  }
  return {
    exists: key => request('GET', key),
    delete: key => request('DELETE', key),
    writeCanary: (key, body) => {
      if (!/^__airtrust_qa_preflight__\/compliance\/[0-9]{3,32}\/capability\.txt$/.test(key))
        throw Error('QA_R2_CANARY_SCOPE_DENIED');
      return request('PUT', key, body);
    },
  };
}

export async function proveCloudflareR2CleanupCapability({
  accountId, token, runId, fetchImpl = fetch,
}) {
  if (!/^[0-9]{3,32}$/.test(String(runId || '')))
    throw Error('QA_R2_PREFLIGHT_RUN_ID_INVALID');
  const key = '__airtrust_qa_preflight__/compliance/' + runId + '/capability.txt';
  const storage = createCloudflareR2Storage({accountId, token, fetchImpl});
  let uploaded = false;
  try {
    await storage.writeCanary(key, 'AIRTRUST_QA_R2_PREFLIGHT_' + runId);
    uploaded = true;
    if (!await storage.exists(key)) throw Error('QA_R2_PREFLIGHT_WRITE_NOT_VISIBLE');
    await storage.delete(key);
    if (await storage.exists(key)) throw Error('QA_R2_PREFLIGHT_DELETE_NOT_VERIFIED');
    uploaded = false;
    return { result: 'PASS', capability: 'R2_REST_READ_WRITE_DELETE', runId };
  } finally {
    if (uploaded) {
      // A failed preflight MUST NOT continue to the synthetic D1 fixture.
      await storage.delete(key);
      if (await storage.exists(key)) throw Error('QA_R2_PREFLIGHT_CANARY_REMAINS');
    }
  }
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

export function validateR2CleanupPlan(plan, code, marker) {
  assertRunIdentity(code, marker);
  if (!plan || plan.code !== code || plan.marker !== marker ||
      !Array.isArray(plan.rows) || plan.rows.length > 16)
    throw Error('QA_R2_RUN_PLAN_INVALID');
  const keys = plan.rows.map(row => ownedPdfKey(row, code));
  if (new Set(keys).size !== keys.length) throw Error('QA_PDF_DUPLICATE_KEY');
  return plan.rows;
}

function runPlanFile(code) {
  const temp = process.env.RUNNER_TEMP;
  const runId = code.slice('QA-COMP-LIFE-'.length);
  const expected = String(temp || '') + '/airtrust-f1-r2-' + runId + '.json';
  if (!temp || process.env.QA_R2_PLAN_FILE !== expected)
    throw Error('QA_R2_RUN_PLAN_PATH_DENIED');
  return expected;
}

async function main() {
  const args = process.argv.slice(2);
  const code = (args.find(v => v.startsWith('--code=')) || '').slice(7);
  const marker = (args.find(v => v.startsWith('--marker=')) || '').slice(9);
  const apply = args.includes('--apply');
  const preparePlan = args.includes('--prepare-plan');
  const preflight = args.includes('--preflight');
  assertRunIdentity(code, marker);
  if (process.env.STAGING_D1_NAME && process.env.STAGING_D1_NAME !== QA_DB)
    throw Error('QA_D1_TARGET_REJECTED');
  if ((apply || preflight || preparePlan) &&
      process.env.CONFIRM_STAGING_COMPLIANCE_LIFECYCLE_QA !== QA_CONFIRM)
    throw Error('QA_R2_CONFIRMATION_REQUIRED');
  if (preflight) {
    const runId = code.slice('QA-COMP-LIFE-'.length);
    const result = await proveCloudflareR2CleanupCapability({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_WORKER_API_TOKEN, runId,
    });
    console.log(JSON.stringify(result));
    return;
  }
  if (preparePlan) {
    // Read-only D1 phase. The next step will use only Worker/R2 credentials.
    const rows = queryStagingD1(buildOwnedPdfSql(code, marker));
    const plan = {code, marker, rows};
    validateR2CleanupPlan(plan, code, marker);
    writeFileSync(runPlanFile(code), JSON.stringify(plan), {flag:'wx',mode:0o600});
    console.log(JSON.stringify({result:'PASS',ownedPdfCount:rows.length,stage:'D1_READ_ONLY_PLAN'}));
    return;
  }
  if (!apply) {
    const rows = queryStagingD1(buildOwnedPdfSql(code, marker));
    console.log(JSON.stringify(await cleanupOwnedPdfs(rows, code, marker, null, false)));
    return;
  }
  // R2-only phase. Never map the D1 token and Worker token to the same step.
  const plan = JSON.parse(readFileSync(runPlanFile(code), 'utf8'));
  const rows = validateR2CleanupPlan(plan, code, marker);
  if (rows.length === 0) {
    console.log(JSON.stringify({result:'PASS',checked:0,deleted:0,dryRun:false}));
    return;
  }
  const storage = createCloudflareR2Storage({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_WORKER_API_TOKEN,
  });
  const result = await cleanupOwnedPdfs(rows, code, marker, storage, true);
  console.log(JSON.stringify({result:'PASS',...result}));
}

if (process.argv[1] && /cleanup-qa-training-compliance-r2\.mjs$/.test(process.argv[1])) {
  main().catch(e => { console.error(String(e?.message || e)); process.exitCode=1; });
}
