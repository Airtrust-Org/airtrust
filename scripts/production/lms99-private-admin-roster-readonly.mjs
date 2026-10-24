#!/usr/bin/env node
/**
 * Tenant 6: confidential read-only inventory of LMS enrollments at >=99%.
 * No student records, access tokens or names are emitted to the Actions log.
 * Only a public-key-encrypted artifact may contain learner identifiers.
 */
import process from 'node:process';
import { writeFileSync } from 'node:fs';
import { createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertAllowedProductionBaseUrl, extractAccessToken, fetchJson, login } from '../smoke-auth-common.mjs';

const API = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const MAIN = String(process.env.EXPECTED_MAIN_SHA || '').trim().toLowerCase();
const PROD = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
const PUBLIC = String(process.env.REVIEW_PUBLIC_KEY_SPKI_DER_B64 || '');
const EXPECTED = Number(process.env.EXPECTED_PENDING_COUNT || 12);
const TENANT = 6;
const LIMIT = 200;

function requireValue(condition, code) {
  if (!condition) throw new Error('LMS99_PRIVATE_REVIEW_' + code);
}
function upper(value) { return String(value ?? '').trim().toUpperCase(); }
function progress(row) {
  const n = Number(row?.progresso_bruto ?? row?.progresso_pct ?? -1);
  return Number.isFinite(n) ? n : -1;
}
export function classify(row) {
  if (row.edition_mismatch?.required === true) return 'LMS_NEW_EDITION_REQUIRED';
  const closure = row.closure_readiness;
  if (closure?.eligible_for_server_verification === true &&
      closure?.code === 'SCORM_READY_FOR_SERVER_VERIFICATION') return 'SCORM_READY_FOR_SERVER_VERIFICATION';
  const code = String(closure?.code || 'CLOSURE_READINESS_MISSING');
  return /^[A-Z0-9_.-]{1,80}$/.test(code) ? code : 'UNCLASSIFIED';
}
function read(token, route) {
  requireValue(route.startsWith('/api/lms/') ||
    ['/api/auth/empresas', '/api/auth/me', '/api/empresas/minha'].includes(route), 'READ_PATH_BLOCKED');
  return fetchJson(API + route, { headers: { Authorization: 'Bearer ' + token } });
}
async function versionPin() {
  const r = await fetchJson(API + '/api/version');
  const d = r.json?.data ?? r.json;
  requireValue(r.status === 200 &&
    String(d?.sourceSha || d?.source_sha || '').toLowerCase() === PROD, 'PRODUCTION_SHA_CHANGED');
}
async function adminToken() {
  const email = String(process.env.PROD_SMOKE_EMAIL || '').trim();
  const password = String(process.env.PROD_SMOKE_PASSWORD || '');
  requireValue(email && password, 'CREDENTIALS_UNAVAILABLE');
  let token = extractAccessToken(await login(API, email, password));
  requireValue(token, 'LOGIN_FAILED');
  const companies = await read(token, '/api/auth/empresas');
  requireValue(companies.status === 200, 'COMPANIES_READ_FAILED');
  requireValue(companies.json?.data?.empresas?.some(x => Number(x.id) === TENANT), 'TENANT_NOT_AUTHORIZED');
  if (Number(companies.json?.data?.empresaAtualId) !== TENANT) {
    const r = await fetchJson(API + '/api/auth/select-empresa', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresaId: TENANT }),
    });
    requireValue(r.status === 200 && r.json?.data?.accessToken, 'TENANT_SELECTION_FAILED');
    token = r.json.data.accessToken;
  }
  const me = await read(token, '/api/auth/me');
  const company = await read(token, '/api/empresas/minha');
  requireValue(me.status === 200 &&
    ['ADMIN', 'ADMINISTRADOR'].includes(upper(me.json?.data?.role)), 'ADMIN_REQUIRED');
  requireValue(company.status === 200 && Number(company.json?.data?.id) === TENANT, 'TENANT_MISMATCH');
  return token;
}
async function pages(token, route) {
  const rows = [];
  let count = null;
  for (let page = 1; page <= 100; page++) {
    const join = route.includes('?') ? '&' : '?';
    const r = await read(token, route + join + 'page=' + page + '&limit=' + LIMIT);
    requireValue(r.status === 200 && Array.isArray(r.json?.data), 'PAGINATED_READ_FAILED');
    const total = Number(r.json?.pagination?.total);
    requireValue(Number.isSafeInteger(total) && total >= 0 && total <= 20000, 'COUNT_INVALID');
    if (count === null) count = total;
    requireValue(count === total, 'PAGINATION_DRIFT');
    rows.push(...r.json.data);
    if (rows.length === total) return rows;
    requireValue(rows.length < total && r.json.data.length > 0, 'PAGINATION_STALLED');
  }
  throw new Error('LMS99_PRIVATE_REVIEW_PAGINATION_LIMIT');
}
async function collect(token) {
  const courses = (await pages(token, '/api/lms/cursos'))
    .filter(c => Number(c.ativo) === 1 && Number(c.publicado) === 1 &&
      String(c.tipo_conteudo || '').toLowerCase() === 'scorm');
  const out = [];
  const seen = new Set();
  for (const course of courses) {
    const rows = await pages(token,
      '/api/lms/matriculas/curso/' + Number(course.id) + '?status=EM_ANDAMENTO');
    for (const row of rows) {
      if (upper(row.status) !== 'EM_ANDAMENTO' || progress(row) < 99) continue;
      const enrollment = Number(row.id);
      requireValue(Number.isSafeInteger(enrollment) && enrollment > 0 &&
        !seen.has(enrollment), 'DUPLICATE_OR_INVALID_ENROLLMENT');
      seen.add(enrollment);
      const detailResponse = await read(token, '/api/lms/matriculas/' + enrollment);
      requireValue(detailResponse.status === 200, 'DETAIL_READ_FAILED');
      const d = detailResponse.json?.data;
      requireValue(d && Number(d.id) === enrollment &&
        Number(d.empresa_id) === TENANT &&
        Number(d.curso_id) === Number(course.id) &&
        upper(d.status) === 'EM_ANDAMENTO' && progress(d) >= 99, 'DETAIL_DRIFT');
      const name = String(row.funcionario_nome || '').trim();
      requireValue(name && name.length <= 220, 'NAME_MISSING_OR_INVALID');
      const employeeId = Number(row.funcionario_id);
      requireValue(Number.isSafeInteger(employeeId) && employeeId > 0 &&
        Number(d.funcionario_id) === employeeId, 'EMPLOYEE_MISMATCH');
      out.push({
        matricula_lms: enrollment,
        funcionario: name,
        funcionario_id: employeeId,
        matricula_funcionario: String(row.funcionario_matricula ?? '').trim().slice(0, 80) || null,
        curso_id: Number(course.id),
        curso: String(course.titulo || '').trim().slice(0, 180),
        status: upper(d.status),
        progresso_bruto: progress(d),
        motivo: classify(d),
        nota_pct: typeof d.completion_diagnostic?.score_pct === 'number'
          ? d.completion_diagnostic.score_pct : null,
        nota_minima: Number.isFinite(Number(d.scorm_mastery_score)) ?
          Number(d.scorm_mastery_score) : null,
        edicao_anterior_telas: d.edition_mismatch?.previous_total ?? null,
        edicao_atual_telas: d.edition_mismatch?.active_total ?? null,
      });
    }
  }
  return out.sort((a,b) => a.curso_id - b.curso_id || a.matricula_lms - b.matricula_lms);
}
export function validateRoster(roster, expected = 12) {
  requireValue(Array.isArray(roster) && roster.length === expected, 'PENDING_COUNT_CHANGED');
  requireValue(roster.every(x => Number.isSafeInteger(x.matricula_lms) &&
    x.matricula_lms > 0 && x.funcionario && x.status === 'EM_ANDAMENTO' &&
    x.progresso_bruto >= 99), 'ROW_INVALID');
  requireValue(new Set(roster.map(x => x.matricula_lms)).size === expected, 'DUPLICATE_ID');
  return true;
}
function seal(roster) {
  const key = createPublicKey({key: Buffer.from(PUBLIC, 'base64'),format:'der',type:'spki'});
  requireValue(key.asymmetricKeyType === 'rsa' &&
    key.asymmetricKeyDetails?.modulusLength >= 3072, 'PUBLIC_KEY_INVALID');
  const secret = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',secret,iv);
  const plain = Buffer.from(JSON.stringify({
    main_sha: MAIN, production_sha: PROD, tenant: TENANT,
    generated_at: new Date().toISOString(), records: roster,
  }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plain),cipher.final()]);
  return {
    version:1, alg:'RSA-OAEP-SHA256+AES-256-GCM',main_sha:MAIN,production_sha:PROD,
    tenant:TENANT, count:roster.length, contains_personal_data_encrypted:true,
    encrypted_key:publicEncrypt({key,oaepHash:'sha256'},secret).toString('base64'),
    iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
    ciphertext:ciphertext.toString('base64'),
  };
}
async function main() {
  requireValue(process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_REF === 'refs/heads/main' &&
    process.env.GITHUB_SHA === MAIN, 'MAIN_REQUIRED');
  requireValue(/^[0-9a-f]{40}$/.test(MAIN) && /^[0-9a-f]{40}$/.test(PROD) &&
    EXPECTED === 12, 'SCOPE_INVALID');
  requireValue(process.env.REVIEW_CONFIRMATION === 'AIRTRUST_LMS99_PRIVATE_ROSTER_READONLY',
    'CONFIRMATION_INVALID');
  await versionPin();
  const token = await adminToken();
  const roster = await collect(token);
  validateRoster(roster,EXPECTED);
  await versionPin();
  const envelope = seal(roster);
  requireValue(process.env.RUNNER_TEMP, 'RUNNER_TEMP_MISSING');
  writeFileSync(process.env.RUNNER_TEMP + '/lms99-roster.enc.json',
    JSON.stringify(envelope), {mode:0o600,flag:'wx'});
  // Public logs contain counts only. NEVER log names, IDs or plaintext.
  console.log(JSON.stringify({main_sha:MAIN,production_sha:PROD,tenant:TENANT,
    encrypted_count:roster.length,writes:0,encrypted:true}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    // Fail with constant code; never reflect responses, URLs or PII into Actions logs.
    console.error('LMS99_PRIVATE_ROSTER_REVIEW_FAILED');
    process.exitCode = 1;
  });
}
