#!/usr/bin/env node
/**
 * Production-blocked, synthetic-tenant-only PPTX qualification acceptance.
 * --apply requires the exact staging SHA and a trusted GitHub staging runner.
 * No production accounts, courses, R2 keys or qualifications are inspected.
 * QA qualification history is deliberately retained as immutable evidence;
 * the disposable enrollment/course are cancelled/soft-deleted on exit.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { classifyBrowserError } from './pptx-browser-error-classifier.mjs';
import {
  assert, assertAllowedStagingBaseUrl, decodeJwtPayload, extractAccessToken,
  extractRefreshToken, fetchJson, login, selectEmpresa,
} from '../smoke-auth-common.mjs';

const API = assertAllowedStagingBaseUrl('https://airtrust-api-staging.airtrust.workers.dev');
const PAGES = 'https://staging.airtrust.pages.dev';
const TENANT = 'qa_lms_catalog_audit_smoke';
const EMAIL_ADMIN = 'qa-pptx-admin@staging.airtrust.invalid';
const EMAIL_STUDENT = 'qa-lms-e2e@staging.airtrust.invalid';
const RELEASE_SHA = String(process.env.RELEASE_SHA || '').toLowerCase();
const RESULT_PATH = resolve(process.env.PPTX_QA_RESULT_PATH || 'qa-state/staging-pptx/result.json');
const ROOT = new URL('./fixtures/', import.meta.url);
const RUN_TAG = `QA_PPTX_${String(process.env.GITHUB_RUN_ID || 'LOCAL')}_${String(process.env.GITHUB_RUN_ATTEMPT || '1')}`;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const requireOk = (res, status, label) => {
  assert(res.status === status && res.json?.success === true,
    `${label}: HTTP ${res.status}, code=${String(res.json?.code || 'none')}`);
  return res.json.data;
};
function requireId(value, label) {
  const n = Number(value);
  assert(Number.isSafeInteger(n) && n > 0, `${label}: invalid id`);
  return n;
}
function sanitize(error) {
  return String(error?.message || error).replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\b/g, '[synthetic-email]').slice(0, 270);
}
async function request(token, path, method = 'GET', body) {
  return fetchJson(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function bearer(email, password) {
  const loginPayload = await login(API, email, password);
  let token = extractAccessToken(loginPayload);
  const memberships = requireOk(
    await request(token, '/api/auth/empresas'), 200, 'tenant memberships');
  const companies = Array.isArray(memberships?.empresas) ? memberships.empresas : [];
  const company = companies.find((item) => item.codigo === TENANT);
  assert(company && companies.length === 1, 'STAGING_PPTX_DEDICATED_TENANT_REQUIRED');
  const tenantId = requireId(company.id, 'tenant');
  if (Number(memberships.empresaAtualId) !== tenantId) {
    token = extractAccessToken(requireOk(
      await selectEmpresa(API, token, tenantId), 200, 'tenant selection'));
  }
  const claims = decodeJwtPayload(token);
  assert(Number(claims.empresa_id) === tenantId, 'PPTX_QA_TENANT_TOKEN_MISMATCH');
  return { token, tenantId, claims, loginPayload };
}
async function provenance() {
  assert(/^[0-9a-f]{40}$/.test(RELEASE_SHA), 'RELEASE_SHA_INVALID');
  const version = requireOk(await fetchJson(`${API}/api/version`), 200, 'Worker version');
  assert(version.sourceSha === RELEASE_SHA, 'STAGING_PPTX_WORKER_SHA_MISMATCH');
  const html = await fetch(PAGES, { headers: { Accept: 'text/html' } });
  assert(html.ok, `STAGING_PPTX_PAGES_HTTP_${html.status}`);
  const match = (await html.text()).match(/<meta\s+name=["']build-version["']\s+content=["']([^"']+)["']/i);
  assert(match?.[1]?.startsWith('staging-') &&
    match[1].toLowerCase().endsWith(`-${RELEASE_SHA.slice(0, 7)}`),
  'STAGING_PPTX_PAGES_SHA_MISMATCH');
}
async function upload(token, cursoId, edition) {
  const bytes = readFileSync(new URL(`qa-pptx-3-slides-${edition}.pptx`, ROOT));
  const form = new FormData();
  form.append('arquivo', new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }), `synthetic-${edition}.pptx`);
  const res = await fetch(`${API}/api/lms/cursos/${cursoId}/upload/pptx`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  const json = await res.json().catch(() => null);
  const slides = Number(json?.data?.slide_count);
  assert(res.status === 200 && json?.success === true && slides === 3,
    `PPTX_QA_UPLOAD_${edition}_FAILED_HTTP_${res.status}_SLIDES_${slides}`);
}
async function getState(token, matriculaId) {
  return requireOk(await request(token, `/api/lms/matriculas/${matriculaId}/pptx-evidence`),
    200, 'PPTX evidence GET');
}
async function observe(token, id, slide, etag) {
  return request(token, `/api/lms/matriculas/${id}/pptx-evidence`, 'POST',
    { slide_index: slide, asset_etag: etag });
}
async function browserReview(token, refreshToken, user, matriculaId, result) {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [{
          origin: PAGES, localStorage: [
            { name: 'airtrust_persist_login', value: '1' },
            { name: 'airtrust_token', value: token },
            { name: 'airtrust_refresh_token', value: refreshToken },
            { name: 'airtrust_user', value: JSON.stringify(user) },
          ],
        }] }, viewport: { width: 1366, height: 768 },
      });
      const page = await context.newPage();
      let pageException = false;
      const errorClasses = new Set();
      const pendingConsole = [];
      let assetHttp = 'NONE';
      let enrollmentHttp = 'NONE';
      page.on('pageerror', (error) => {
        pageException = true;
        errorClasses.add(classifyBrowserError(String(error)));
      });
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        errorClasses.add(classifyBrowserError(message.text()));
        for (const argument of message.args()) {
          pendingConsole.push(argument.evaluate((value) => {
            if (value instanceof Error) return `${value.name}: ${value.message}`;
            return '';
          }).then((value) => { if (value) errorClasses.add(classifyBrowserError(value)); }).catch(() => {}));
        }
      });
      page.on('response', (response) => {
        const responsePath = new URL(response.url()).pathname;
        if (responsePath.startsWith('/api/lms/pptx/asset/')) {
          assetHttp = String(response.status());
        }
        if (responsePath.startsWith('/api/lms/matriculas/')) {
          enrollmentHttp = String(response.status());
        }
      });
      await page.goto(`${PAGES}/lms/player/pptx/${matriculaId}`,
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      try {
        await page.getByText('Slide 1 de 3').waitFor({ timeout: 25000 });
      } catch {
        await Promise.all(pendingConsole);
        // Sanitize the browser failure rather than logging HTML, credentials
        // or user records. All routes and courses here are synthetic staging.
        const path = new URL(page.url()).pathname.replace(/[^/A-Za-z0-9_-]/g, '');
        const authExpired = await page.getByText('Sessão expirada. Faça login novamente.').count() > 0;
        const courseUnavailable = await page.getByText(
          'Conteúdo PowerPoint não disponível para esta matrícula.').count() > 0;
        const loading = await page.getByText('Carregando apresentação...').count() > 0;
        const playerError = await page.getByText(/Falha ao carregar apresenta|Falha ao carregar PPTX/).count() > 0;
        const boundary = await page.getByText('Algo deu errado').count() > 0;
        const concluded = await page.getByText('Status: concluído').count() > 0;
        // Absence of an error message is NOT affirmative proof of authorization.
        throw new Error(`PPTX_QA_${name}_SLIDE_MISSING_${path}_SESSION_ERR${Number(authExpired)}_COURSE_ERR${Number(courseUnavailable)}_LOADING${Number(loading)}_PLAYER_ERR${Number(playerError)}_BOUNDARY${Number(boundary)}_JS_ERR${Number(pageException)}_DONE${Number(concluded)}_ASSET${assetHttp}_ENROLL${enrollmentHttp}_CLASSES_${[...errorClasses].sort().join('-') || 'NONE'}`);
      }
      for (let index = 2; index <= 3; index++) {
        await page.getByRole('button', { name: 'Próximo' }).click();
        await page.getByText(`Slide ${index} de 3`).waitFor();
      }
      assert(await page.getByText('Slide 3 de 3').count() > 0,
        `PPTX_QA_BROWSER_${name}_DID_NOT_RENDER`);
      await context.close();
      result[`browser_${name}`] = 'PASS_COMPLETED_READONLY';
    } finally { await browser.close(); }
  }
}
async function main() {
  const fixtures = ['a', 'b'].map((edition) =>
    readFileSync(new URL(`qa-pptx-3-slides-${edition}.pptx`, ROOT)));
  assert(fixtures.every((bytes) => bytes.length > 1000), 'QA_PPTX_FIXTURE_MISSING');
  const apply = process.argv.includes('--apply');
  if (!apply) { console.log('PPTX_QA_DRY_RUN_OK'); return; }
  assert(process.env.CONFIRM_STAGING_PPTX_QA === 'AIRTRUST_STAGING_PPTX_QA',
    'STAGING_PPTX_QA_CONFIRMATION_MISSING');
  assert(process.env.GITHUB_REF === 'refs/heads/main', 'STAGING_PPTX_QA_MAIN_ONLY');
  const password = process.env.STAGING_SMOKE_PASSWORD || '';
  assert(password.length > 0, 'STAGING_PPTX_QA_CENTRAL_SECRET_REQUIRED');
  await provenance();

  const admin = await bearer(EMAIL_ADMIN, password);
  const student = await bearer(EMAIL_STUDENT, password);
  assert(admin.tenantId === student.tenantId, 'STAGING_PPTX_TENANT_MISMATCH');
  const employeeId = requireId(student.claims.funcionario_id, 'learner');
  const result = {
    scope: 'STAGING_SYNTHETIC_PPTX_QUALIFYING',
    release_sha: RELEASE_SHA, staging_tenant_id: admin.tenantId,
    worker_pages_parity: 'PASS', schema_v2_0574: 'EXERCISED',
    status: 'IN_PROGRESS', qa_marker: RUN_TAG, production_writes: 0,
    chromium: 'NOT_RUN', webkit: 'NOT_RUN', immutable_history_retained: true,
  };
  let courseId = null, matriculaId = null, historyId = null;
  let cleanupFailure = null;
  try {
    const categories = requireOk(await request(admin.token, '/api/categorias'),
      200, 'qualification categories');
    assert(Array.isArray(categories), 'PPTX_QA_CATEGORIES_INVALID');
    const ead = categories.filter((entry) =>
      String(entry.nome).trim().toUpperCase() === 'EAD' && entry.ativo === true);
    assert(ead.length <= 1, 'PPTX_QA_CANONICAL_EAD_AMBIGUOUS');
    const otherIntegrated = categories.filter((entry) =>
      entry.ativo === true && entry.lms_integrada === true &&
      !ead.some((candidate) => Number(candidate.id) === Number(entry.id)));
    assert(otherIntegrated.length === 0, 'PPTX_QA_OTHER_LMS_CATEGORY_ALREADY_INTEGRATED');
    let categoryId;
    if (ead.length === 1) {
      categoryId = requireId(ead[0].id, 'QA EAD category');
      if (ead[0].lms_integrada !== true) {
        const updated = requireOk(await request(admin.token,
          `/api/categorias/${categoryId}`, 'PUT', { lms_integrada: true }),
        200, 'QA EAD LMS integration');
        assert(updated.lms_integrada === true, 'PPTX_QA_EAD_INTEGRATION_NOT_PERSISTED');
      }
    } else {
      const created = requireOk(await request(admin.token, '/api/categorias', 'POST',
        { nome: 'EAD', codigo: 'EAD', descricao: 'Categoria de testes staging LMS',
          dominio_codigo: 'OPERACOES', ativo: true, lms_integrada: true }),
      201, 'QA EAD category');
      assert(created.lms_integrada === true, 'PPTX_QA_EAD_INTEGRATION_NOT_PERSISTED');
      categoryId = requireId(created.id, 'QA EAD category');
    }

    // A qualifying PPTX must reference a real, current tenant EAD qualification
    // model. Creating an EAD course with gerar_qualificacao=1 but no type ID
    // passes course validation and only fails when LMS completion is attempted.
    const areas = requireOk(await request(admin.token, '/api/qualificacoes/areas'),
      200, 'qualification areas');
    assert(Array.isArray(areas), 'PPTX_QA_AREAS_INVALID');
    const existingArea = areas.find((area) =>
      area.codigo === 'QA_PPTX_EAD' && area.ativo === true);
    const areaId = existingArea
      ? requireId(existingArea.id, 'QA qualification area')
      : requireId(requireOk(await request(admin.token, '/api/qualificacoes/areas', 'POST',
        { codigo: 'QA_PPTX_EAD', nome: 'QA PPTX EAD',
          descricao: 'Area sintética persistente de qualificações PPTX staging' }),
        201, 'QA qualification area').id, 'QA qualification area');
    const qualificationType = requireOk(
      await request(admin.token, '/api/qualificacoes/tipos', 'POST', {
        nome: `${RUN_TAG} - qualificação de teste PPTX`,
        codigo: RUN_TAG,
        categoria_id: categoryId,
        area_id: areaId,
        validade: 12,
        carga_horaria_recorrente: 0.1,
        observacoes: RUN_TAG,
        ativo: true,
      }), 201, 'QA qualification type');
    const qualificationTypeId = requireId(qualificationType.id, 'QA qualification type');
    result.qualification_type_id = qualificationTypeId;
    result.qualification_area_id = areaId;
    const course = requireOk(await request(admin.token, '/api/lms/cursos', 'POST', {
      titulo: `${RUN_TAG} - Synthetic Qualification`,
      descricao: 'PPTX QA isolado; nunca material didático real',
      categoria: 'EAD', tipo_conteudo: 'pptx', idioma: 'pt-BR',
      carga_horaria_minutos: 6, gerar_qualificacao_ao_concluir: 1,
      qualificacao_tipo_id: qualificationTypeId,
      scorm_mastery_score: 80, publicado: 1, ativo: 1,
      observacoes: RUN_TAG,
    }), 201, 'PPTX QA course create');
    courseId = requireId(course.id, 'course');
    result.course_id = courseId;
    const boundCourse = requireOk(await request(admin.token, `/api/lms/cursos/${courseId}`),
      200, 'PPTX qualification binding readback');
    assert(Number(boundCourse.qualificacao_tipo_id) === qualificationTypeId &&
      Number(boundCourse.gerar_qualificacao_ao_concluir) === 1,
    'PPTX_QA_QUALIFICATION_BINDING_NOT_PERSISTED');
    await upload(admin.token, courseId, 'a');
    const matricula = requireOk(await request(admin.token, '/api/lms/matriculas', 'POST',
      { curso_id: courseId, funcionario_id: employeeId, observacoes: RUN_TAG,
        enviar_convite_email: false }),
      201, 'PPTX QA enrollment');
    matriculaId = requireId(matricula.id, 'enrollment');
    result.enrollment_id = matriculaId;

    const initial = await getState(student.token, matriculaId);
    assert(initial.total_slides === 3 && initial.next_slide === 0 &&
      initial.ready_to_finalize === false, 'PPTX_QA_INITIAL_STATE_INVALID');
    const denied = await request(student.token, `/api/lms/matriculas/${matriculaId}/finalizar`, 'POST', {});
    // Integrity middleware evaluates explicit completion before the route's
    // PPTX content-evidence check. Both 409 codes are fail-closed before any
    // slide has been observed. A 200 or unrelated 409 remains a hard failure.
    assert(denied.status === 409 &&
      ['COMPLETION_NOT_REQUESTED', 'CONTENT_EVIDENCE_REQUIRED'].includes(denied.json?.code),
    `PPTX_QA_EARLY_FINALIZATION_NOT_BLOCKED_HTTP_${denied.status}_CODE_${String(denied.json?.code || 'none').replace(/[^A-Za-z0-9_]/g, '').slice(0, 60)}`);
    const rejectedEnrollment = requireOk(await request(student.token,
      `/api/lms/matriculas/${matriculaId}`), 200, 'PPTX early denial readback');
    assert(rejectedEnrollment.status !== 'CONCLUIDO' &&
      rejectedEnrollment.qualificacao_historico_id == null,
    'PPTX_QA_EARLY_DENIAL_MUTATED_COMPLETION_OR_QUALIFICATION');
    const first = await observe(student.token, matriculaId, 0, initial.asset_etag);
    requireOk(first, 200, 'initial slide');
    const resumed = await getState(student.token, matriculaId);
    assert(resumed.next_slide === 1 && resumed.visited_indexes.join(',') === '0',
      'PPTX_QA_RESUME_FAILED');
    const replay = await observe(student.token, matriculaId, 0, initial.asset_etag);
    assert(replay.status === 200 && replay.json?.replay === true,
      'PPTX_QA_IDEMPOTENT_REPLAY_FAILED');
    await upload(admin.token, courseId, 'b');
    const replaced = await getState(student.token, matriculaId);
    assert(replaced.total_slides === 3 && replaced.next_slide === 0 &&
      replaced.asset_etag !== initial.asset_etag, 'PPTX_QA_EDITION_RESET_FAILED');
    const stale = await observe(student.token, matriculaId, 1, initial.asset_etag);
    assert(stale.status === 409 && stale.json?.code === 'PPTX_ASSET_VERSION_MISMATCH',
      'PPTX_QA_STALE_ETAG_NOT_REJECTED');
    const foreign = await observe(admin.token, matriculaId, 0, replaced.asset_etag);
    assert(foreign.status === 403, 'PPTX_QA_ADMIN_IMPERSONATION_NOT_REJECTED');
    for (const index of [0, 1, 2]) {
      if (index > 0) await delay(1850);
      const evidence = requireOk(
        await observe(student.token, matriculaId, index, replaced.asset_etag), 200,
        `PPTX slide ${index}`);
      assert(evidence.next_slide === index + 1, 'PPTX_QA_ORDERED_COVERAGE_FAILED');
    }
    const complete = await getState(student.token, matriculaId);
    assert(complete.ready_to_finalize === true &&
      complete.visited_indexes.join(',') === '0,1,2', 'PPTX_QA_FINAL_COVERAGE_MISSING');
    const finalized = requireOk(
      await request(student.token, `/api/lms/matriculas/${matriculaId}/finalizar`, 'POST', {}),
      200, 'PPTX QA finalization');
    assert(finalized.novo_status === 'CONCLUIDO', 'PPTX_QA_NOT_CONCLUDED');
    historyId = requireId(finalized.qualificacao_gerada?.qualificacao_historico_id, 'qualification');
    const repeated = requireOk(
      await request(student.token, `/api/lms/matriculas/${matriculaId}/finalizar`, 'POST', {}),
      200, 'PPTX repeated finalization');
    assert(repeated.novo_status === 'CONCLUIDO' &&
      !repeated.qualificacao_gerada, 'PPTX_QA_REPEAT_MINTED_QUALIFICATION');
    const detail = requireOk(await request(student.token,
      `/api/lms/matriculas/${matriculaId}`), 200, 'enrollment details');
    assert(Number(detail.qualificacao_historico_id) === historyId &&
      detail.status === 'CONCLUIDO', 'PPTX_QA_COMPLETION_READBACK_FAILED');
    const inactive = await observe(student.token, matriculaId, 0, replaced.asset_etag);
    assert(inactive.status === 409 && inactive.json?.code === 'PPTX_ENROLLMENT_INACTIVE',
      'PPTX_QA_COMPLETED_REVIEW_NOT_READONLY');
    result.history_id = historyId;
    await browserReview(student.token, extractRefreshToken(student.loginPayload),
      student.loginPayload?.data?.user || {}, matriculaId, result);
    await provenance();
    result.status = 'PASS';
  } catch (error) {
    result.status = 'FAIL';
    result.failure = sanitize(error);
  } finally {
    if (matriculaId) {
      const removed = await request(admin.token, `/api/lms/matriculas/${matriculaId}`, 'DELETE').catch(() => null);
      if (removed?.status !== 200) cleanupFailure = 'PPTX_QA_ENROLLMENT_CLEANUP_FAILED';
    }
    if (courseId) {
      const removed = await request(admin.token, `/api/lms/cursos/${courseId}`, 'DELETE').catch(() => null);
      if (removed?.status !== 200) cleanupFailure = cleanupFailure || 'PPTX_QA_COURSE_CLEANUP_FAILED';
    }
    result.cleanup = cleanupFailure || 'PASS';
    mkdirSync(dirname(RESULT_PATH), { recursive: true });
    writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  }
  assert(result.status === 'PASS', result.failure || 'PPTX_QA_FAILED');
  assert(result.cleanup === 'PASS', result.cleanup);
  console.log('STAGING_PPTX_QUALIFYING_LIVE_QA_PASS');
}
main().catch((error) => {
  console.error(`STAGING_PPTX_QUALIFYING_LIVE_QA_FAILED: ${sanitize(error)}`);
  process.exitCode = 1;
});
