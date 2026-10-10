import fs from 'node:fs';
import path from 'node:path';
import {
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';
import {
  hasMeaningfulScormLocation,
  launchInitialCmi,
  parseLaunchCycle,
  resolveExpectedCandidateId,
  summarizeEnrollment,
} from './lms-enrollment-readonly-review-helpers.mjs';

const base = String(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online').replace(/\/$/, '');
const api = assertAllowedProductionBaseUrl(base);
const email = String(process.env.E2E_EMAIL || '').trim();
const password = String(process.env.E2E_PASSWORD || '');
const matricula = Number(process.env.MATRICULA_ID || 0);
const expectedCandidate = String(process.env.EXPECTED_CANDIDATE_ID || 'auto').trim().toLowerCase();
const expectedTenantId = Number(process.env.EXPECTED_TENANT_ID || 6);
const expectedCycle = Number(process.env.EXPECTED_CYCLE_NUMBER || 0);
const expectedProgress = Number(process.env.EXPECTED_PROGRESS_PCT || 0);
const reportPath = String(process.env.REPORT_PATH || 'qa-state/production-lms-scorm-review-readonly.json');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function safe(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\b/g, '[email]')
    .slice(0, 500);
}

async function authJson(token, route, options = {}) {
  return fetchJson(`${api}${route}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function productionToken() {
  invariant(email && password, 'PRODUCTION_SMOKE_CREDENTIALS_MISSING');
  const logged = await login(api, email, password);
  let token = extractAccessToken(logged);
  const companies = await authJson(token, '/api/auth/empresas');
  invariant(companies.status === 200, `AUTH_EMPRESAS_HTTP_${companies.status}`);
  const options = Array.isArray(companies.json?.data?.empresas) ? companies.json.data.empresas : [];
  invariant(options.some((item) => Number(item?.id || 0) === expectedTenantId), 'TARGET_COMPANY_NOT_AUTHORIZED');
  if (Number(companies.json?.data?.empresaAtualId || 0) !== expectedTenantId) {
    const selected = await authJson(token, '/api/auth/select-empresa', {
      method: 'POST',
      body: { empresaId: expectedTenantId },
    });
    invariant(selected.status === 200, `SELECT_EMPRESA_HTTP_${selected.status}`);
    token = String(selected.json?.data?.accessToken || '');
    invariant(token, 'SELECT_EMPRESA_TOKEN_MISSING');
  }
  const selectedTenant = await authJson(token, '/api/empresas/minha');
  invariant(
    selectedTenant.status === 200 && Number(selectedTenant.json?.data?.id || 0) === expectedTenantId,
    'TARGET_COMPANY_CONTEXT_MISMATCH',
  );
  return token;
}

async function readEnrollment(token) {
  const response = await authJson(token, `/api/lms/matriculas/${matricula}`);
  invariant(response.status === 200, `ENROLLMENT_HTTP_${response.status}`);
  invariant(response.json?.success === true && response.json?.data, 'ENROLLMENT_RESPONSE_INVALID');
  const enrollment = response.json.data;
  invariant(Number(enrollment.id) === matricula, 'ENROLLMENT_ID_MISMATCH');
  invariant(Number(enrollment.empresa_id) === expectedTenantId, 'ENROLLMENT_TENANT_MISMATCH');
  invariant(String(enrollment.tipo_conteudo || '').toLowerCase() === 'scorm', 'ENROLLMENT_NOT_SCORM');
  invariant(Number(enrollment.curso_id) > 0, 'ENROLLMENT_COURSE_ID_MISSING');
  const candidateId = resolveExpectedCandidateId({
    expectedCandidateId: expectedCandidate,
    activePrefix: enrollment.scorm_package_r2_prefix,
  });
  return { enrollment, candidateId };
}

async function getAssetSession(token) {
  const response = await fetch(`${api}/api/lms/assets/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula_id: matricula }),
  });
  invariant(response.ok, `ASSET_SESSION_HTTP_${response.status}`);
  const cookieHeader = response.headers.get('set-cookie') || '';
  const cookie = cookieHeader.split(';')[0];
  invariant(cookie.includes('='), 'ASSET_COOKIE_MISSING');
  return cookie;
}

function readAssetCandidate(response, candidateId, label) {
  const assetKey = response.headers.get('x-lms-asset-key') || '';
  invariant(response.ok, `${label}_HTTP_${response.status}`);
  invariant(assetKey.includes(`/_candidates/${candidateId}/`), `${label}_WRONG_PACKAGE`);
  return assetKey;
}

async function run() {
  invariant(Number.isInteger(matricula) && matricula > 0, 'MATRICULA_ID_INVALID');
  invariant(Number.isInteger(expectedTenantId) && expectedTenantId > 0, 'EXPECTED_TENANT_ID_INVALID');
  invariant(Number.isInteger(expectedCycle) && expectedCycle >= 0, 'EXPECTED_CYCLE_NUMBER_INVALID');
  invariant(Number.isFinite(expectedProgress) && expectedProgress >= 0 && expectedProgress <= 100, 'EXPECTED_PROGRESS_PCT_INVALID');

  const token = await productionToken();
  const { enrollment, candidateId } = await readEnrollment(token);
  const enrollmentSummary = summarizeEnrollment(enrollment);
  const cookie = await getAssetSession(token);
  const launch = await fetch(`${api}/api/lms/scorm/launch/${matricula}`, {
    headers: { Cookie: cookie },
  });
  invariant(launch.ok, `LAUNCH_HTTP_${launch.status}`);
  const html = await launch.text();
  invariant(html.includes(`var MATRICULA_ID = ${matricula};`), 'LAUNCH_MATRICULA_MISMATCH');

  const cycle = parseLaunchCycle(html);
  invariant(cycle.ciclo_id && cycle.ciclo_id > 0, 'ACTIVE_CYCLE_ID_MISSING');
  const cmi = launchInitialCmi(html);
  invariant(cmi && typeof cmi === 'object', 'LAUNCH_INITIAL_CMI_UNREADABLE');
  const iframeMatch = html.match(/<iframe[^>]+id="scorm-frame"[^>]+src="([^"]+)"/i);
  invariant(iframeMatch?.[1], 'SCORM_IFRAME_SRC_MISSING');

  const indexUrl = new URL(iframeMatch[1].replaceAll('&amp;', '&'), api);
  const index = await fetch(indexUrl, { headers: { Cookie: cookie } });
  const indexKey = readAssetCandidate(index, candidateId, 'SCORM_INDEX');
  const indexBytes = Number(index.headers.get('content-length') || 0);

  const modelUrl = new URL(indexUrl);
  modelUrl.pathname = modelUrl.pathname.replace(/[^/]+$/, 'course-model.js');
  const model = await fetch(modelUrl, { headers: { Cookie: cookie } });
  const modelKey = model.ok ? readAssetCandidate(model, candidateId, 'COURSE_MODEL') : '';
  const modelText = model.ok ? await model.text() : '';
  const masteryMatch = modelText.match(/(?:"mastery"|'mastery'|\bmastery)\s*:\s*(\d+(?:\.\d+)?)/);
  const packageMastery = masteryMatch ? Number(masteryMatch[1]) : null;
  const expectedMasteryRaw = enrollment.scorm_mastery_score;
  const expectedMastery = expectedMasteryRaw == null || expectedMasteryRaw === ''
    ? null
    : Number(expectedMasteryRaw);
  const masteryMatches = model.ok && Number.isFinite(expectedMastery)
    ? packageMastery === expectedMastery
    : null;

  const launchLocation =
    cmi['cmi.core.lesson_location'] ?? cmi['cmi.location'] ?? null;
  const launchSuspendData = cmi['cmi.suspend_data'];
  const serverResumeLocationPresent = hasMeaningfulScormLocation(enrollmentSummary.scorm.lesson_location);
  const serverSuspendDataPresent = enrollmentSummary.scorm.suspend_data_present;
  const stateMatches =
    enrollmentSummary.progress_pct === expectedProgress &&
    (expectedCycle === 0 || cycle.numero_ciclo === expectedCycle) &&
    cycle.review_mode === false &&
    !serverResumeLocationPresent &&
    !serverSuspendDataPresent &&
    (launchLocation == null || launchLocation === '') &&
    !String(launchSuspendData || '').length &&
    cycle.preview_mode === false;
  const courseOpens = index.ok && (!model.ok || Boolean(modelKey));
  const result = courseOpens && stateMatches && masteryMatches !== false ? 'PASS' : 'FAIL';
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    result,
    writes: 'none (authentication/tenant selection/asset session POSTs only; enrollment, progress, cycle, qualification and certificate data are read-only)',
    enrollment: enrollmentSummary,
    expected: {
      tenant_id: expectedTenantId,
      cycle_number: expectedCycle || null,
      progress_pct: expectedProgress,
    },
    launch: {
      http_status: launch.status,
      cycle_id_present: Boolean(cycle.ciclo_id),
      cycle_number: cycle.numero_ciclo,
      preview_mode: cycle.preview_mode,
      review_mode: cycle.review_mode,
      server_resume_location_present: serverResumeLocationPresent,
      server_suspend_data_present: serverSuspendDataPresent,
      initial_lesson_location_present: launchLocation != null && launchLocation !== '',
      initial_suspend_data_present: String(launchSuspendData || '').length > 0,
    },
    package: {
      candidate_matches_enrollment: true,
      index_http_status: index.status,
      index_key_matches_candidate: indexKey.includes(`/_candidates/${candidateId}/`),
      index_content_length: indexBytes || null,
      model_http_status: model.status,
      model_key_matches_candidate: model.ok ? modelKey.includes(`/_candidates/${candidateId}/`) : null,
      expected_mastery_score: Number.isFinite(expectedMastery) ? expectedMastery : null,
      package_mastery_score: packageMastery,
      mastery_matches_enrollment: masteryMatches,
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (result !== 'PASS') process.exitCode = 2;
}

run().catch((error) => {
  console.error(`PRODUCTION_SCORM_REVIEW_FAILED:${safe(error?.message || error)}`);
  process.exit(1);
});
