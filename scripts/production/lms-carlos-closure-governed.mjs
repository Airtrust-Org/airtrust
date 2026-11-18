#!/usr/bin/env node
// Two specifically requested administrative completions. Never alters SCORM CMI.
// Every write passes through the tenant-scoped, RBAC-guarded canonical API.
import { createHash } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { assertAllowedProductionBaseUrl, extractAccessToken, fetchJson, login } from '../smoke-auth-common.mjs';
import { summarizeEnrollment } from '../validation/lms-enrollment-readonly-review-helpers.mjs';

const TARGETS = Object.freeze([{ id: 577, course: 23, total: 28 }, { id: 703, course: 55, total: 84 }]);
const API = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const MODE = String(process.env.CARLOS_COMPLETION_MODE || '');
const MAIN = String(process.env.EXPECTED_MAIN_SHA || '');
const PROD = String(process.env.EXPECTED_PRODUCTION_SHA || '');
const TENANT = 6;
const reason = 'Reconhecimento administrativo excepcional e auditavel por solicitacao expressa da Gerencia de Treinamento em 18/11/2026: Carlos Castro, matriculas 577 (Regulacao ANAC) e 703 (AW139 SOP), chegaram as ultimas telas, mas seu LMS nao confirmou fechamento. Credito administrativo, sem declarar SCORM passed, nota ou data historica. Incidente #1325.';
const requireProof = (condition, code) => { if (!condition) throw Error('CARLOS_CLOSURE_' + code); };
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const upper = x => String(x ?? '').trim().toUpperCase();

export function validateTarget(data, target) {
  const status = upper(data.status);
  const progress = Number(data.progresso_bruto ?? data.progresso_pct);
  const scorm = summarizeEnrollment(data).scorm;
  const readiness = data.closure_readiness ?? {};
  const missing = Array.isArray(readiness.missing) ? readiness.missing : [];
  requireProof(Number(data.empresa_id) === TENANT, 'ENROLLMENT_TENANT_MISMATCH');
  requireProof(Number(data.id) === target.id && Number(data.curso_id) === target.course, 'ENROLLMENT_COURSE_MISMATCH');
  requireProof(Number.isSafeInteger(Number(data.funcionario_id)) && Number(data.funcionario_id) > 0, 'EMPLOYEE_MISSING');
  if (status === 'CONCLUIDO') {
    requireProof(progress === 100 && Boolean(String(data.data_conclusao || '').trim()), 'INVALID_PRIOR_COMPLETION');
    return { id: target.id, course: target.course, status, progress, already_completed: true, funcionario_id: Number(data.funcionario_id) };
  }
  requireProof(status === 'EM_ANDAMENTO' && progress === 100, 'NOT_ELIGIBLE_INCOMPLETE_100');
  requireProof(readiness.code === 'PROGRESS_EVIDENCE_MISSING' && readiness.last_step_reached === true,
    'NO_TERMINAL_VISIT_OR_WRONG_BLOCKER');
  requireProof(readiness.eligible_for_server_verification === false &&
    missing.includes('manifest_required_units') && missing.includes('terminal_scorm_status') &&
    missing.every(x => ['manifest_required_units', 'terminal_scorm_status'].includes(x)), 'UNREVIEWED_REQUIREMENT');
  requireProof(!readiness.assessment_verified || !missing.includes('assessment_score'), 'ASSESSMENT_INCONSISTENT');
  requireProof(String(scorm.lesson_status ?? '').toLowerCase() === 'incomplete', 'SCORM_STATUS_CHANGED');
  const location = String(scorm.lesson_location ?? '').trim();
  requireProof(location === `${target.total}/${target.total}`, 'LAST_LOCATION_CHANGED');
  requireProof(readiness.slide_coverage?.total === target.total, 'EDITION_TOTAL_CHANGED');
  requireProof(!data.edition_mismatch?.required && !data.scorm_handoff_required, 'EDITION_MISMATCH');
  requireProof(!data.qualificacao_historico_id, 'QUALIFICATION_ALREADY_LINKED');
  return {
    id: target.id, course: target.course, status, progress, location,
    missing: [...missing].sort(), recorded: Number(readiness.slide_coverage.recorded),
    funcionario_id: Number(data.funcionario_id), already_completed: false,
    observations_hash: sha(String(data.observacoes ?? '')),
  };
}
async function read(token, path) {
  requireProof(path.startsWith('/api/lms/matriculas/') || ['/api/auth/me', '/api/auth/empresas', '/api/empresas/minha'].includes(path), 'READ_PATH');
  const r = await fetchJson(API + path, { headers: { Authorization: 'Bearer ' + token } });
  requireProof(r.status === 200 && r.json?.data, 'READ_HTTP');
  return r.json.data;
}
async function pin() {
  const r = await fetchJson(API + '/api/version');
  requireProof(r.status === 200 && String(r.json?.data?.sourceSha) === PROD, 'PROD_SHA_CHANGED');
}
async function auth() {
  const email = process.env.PROD_SMOKE_EMAIL, password = process.env.PROD_SMOKE_PASSWORD;
  requireProof(Boolean(email && password), 'MISSING_CREDENTIAL');
  let token = extractAccessToken(await login(API, email, password));
  requireProof(Boolean(token), 'NO_TOKEN');
  const companies = await read(token, '/api/auth/empresas');
  requireProof(companies.empresas?.some(x => Number(x.id) === TENANT), 'WRONG_TENANT');
  if (Number(companies.empresaAtualId) !== TENANT) {
    const r = await fetchJson(API + '/api/auth/select-empresa', { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresaId: TENANT }) });
    requireProof(r.status === 200 && r.json?.data?.accessToken, 'TENANT_SELECT');
    token = r.json.data.accessToken;
  }
  const me = await read(token, '/api/auth/me');
  requireProof(['ADMIN', 'ADMINISTRADOR'].includes(upper(me.role)), 'ADMIN_ONLY');
  const company = await read(token, '/api/empresas/minha');
  requireProof(Number(company.id) === TENANT, 'TENANT_CONFIRM');
  return token;
}
async function snapshot(token) {
  const rows = [];
  for (const target of TARGETS) rows.push(validateTarget(await read(token, `/api/lms/matriculas/${target.id}`), target));
  requireProof(rows[0].funcionario_id === rows[1].funcionario_id, 'DIFFERENT_LEARNERS');
  return rows;
}
export function publicReport(rows, writes, mode = MODE) {
  return { schema_version: 1, mode, tenant: TENANT, main_sha: MAIN, production_sha: PROD,
    target_courses: TARGETS.map(x => x.course), enrolled: TARGETS.length,
    rows: rows.map(x => ({ course: x.course, status: x.status, progress: x.progress, already_completed: x.already_completed })),
    evidence_hash: sha(rows), writes, scorm_changed: false, historical_dates_fabricated: false, personal_data: false };
}
async function main() {
  requireProof(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF === 'refs/heads/main', 'MAIN_ONLY');
  requireProof(MAIN === process.env.GITHUB_SHA && /^[a-f0-9]{40}$/.test(PROD), 'SHA_INVALID');
  requireProof(['dry-run', 'apply'].includes(MODE) && process.env.CARLOS_COMPLETION_CONFIRMATION ===
    (MODE === 'apply' ? 'AIRTRUST_CARLOS_577_703_APPLY' : 'AIRTRUST_CARLOS_577_703_DRY_RUN'), 'MODE_OR_CONFIRMATION');
  await pin();
  const token = await auth();
  const before = await snapshot(token);
  const report = publicReport(before, 0);
  if (MODE === 'dry-run') { console.log(JSON.stringify(report)); return; }
  requireProof(process.env.REVIEWED_EVIDENCE_HASH === report.evidence_hash, 'UNREVIEWED_COHORT_CHANGE');
  // Both must be eligible before the first mutation. Idempotent completed rows remain immutable.
  let writes = 0;
  const processed = new Set();
  for (const row of before) {
    if (row.already_completed) continue;
    await pin();
    const current = await snapshot(token);
    for (const [i, observed] of current.entries()) {
      if (processed.has(observed.id)) requireProof(observed.already_completed, 'PREVIOUS_WRITE_NOT_PERSISTED');
      else requireProof(sha(observed) === sha(before[i]), 'CONCURRENT_DRIFT');
    }
    const detail = await read(token, `/api/lms/matriculas/${row.id}`);
    requireProof(sha(validateTarget(detail, TARGETS.find(x => x.id === row.id))) === sha(row), 'ROW_CHANGED');
    const observations = [String(detail.observacoes ?? '').trim(), reason].filter(Boolean).join('\n\n');
    const r = await fetchJson(API + `/api/lms/matriculas/${row.id}/status`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONCLUIDO', observacoes }) });
    requireProof(r.status === 200 && r.json?.success === true, 'CANONICAL_API_REJECTED_' + r.status);
    const after = await read(token, `/api/lms/matriculas/${row.id}`);
    requireProof(after.status === 'CONCLUIDO' && Number(after.progresso_pct) === 100 &&
      Boolean(after.data_conclusao), 'POSTCHECK_FAILED');
    writes++;
    processed.add(row.id);
  }
  const after = await snapshot(token);
  requireProof(after.every(x => x.already_completed), 'NOT_ALL_COMPLETED');
  console.log(JSON.stringify({ ...publicReport(after, writes), reviewed_evidence_hash: report.evidence_hash, final_readback: 'CONCLUIDO_2_OF_2' }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => { console.error(String(e.message).slice(0,150)); process.exitCode = 1; });
