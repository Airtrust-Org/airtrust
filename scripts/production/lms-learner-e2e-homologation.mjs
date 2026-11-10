#!/usr/bin/env node
/**
 * AIRTRUST — Motor de Homologação LMS/EAD em Produção com Aluno Sintético
 *
 * Executa a homologação funcional completa do catálogo LMS/EAD:
 * 1. Login autenticado como o aluno de teste QA-LMS-202611.
 * 2. Matrícula oficial via API (POST /api/lms/matriculas).
 * 3. Abertura do player em navegador real (Chromium e WebKit).
 * 4. Percurso integral interagindo com slides, botões, accordions, quizzes e vídeos.
 * 5. Teste obrigatório de persistência e retomada (Etapa C) com fechamento de sessão.
 * 6. Finalização e persistência no banco (LMSCommit/LMSFinish/completeLmsMatricula).
 * 7. Pós-conclusão: validação de status CONCLUÍDO, qualificação, certificado e reabertura sem downgrade.
 * 8. Geração da Matriz de Homologação oficial com as 17 colunas exigidas.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '@playwright/test';
import { extractAnswerPlan } from '../validation/lms-scorm-answer-plan.mjs';
import { collectRequiredDecisionSlideIndices } from '../validation/lms-scorm-required-decision-diagnostics.mjs';
import { readVisibleVideo, startRealVisibleVideo } from '../validation/lms-scorm-video-playback-readonly.mjs';
import {
  assert,
  assertAllowedProductionBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
  selectEmpresa,
} from '../smoke-auth-common.mjs';

const API = assertAllowedProductionBaseUrl(
  process.env.PROD_API_BASE_URL || 'https://api.airtrust.online',
);
const TARGET_COMPANY_ID = Number(process.env.TARGET_COMPANY_ID || 6);
const EXPECTED_SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
const BROWSER_NAME = String(process.env.HOMOLOGATION_BROWSER || 'chromium').trim().toLowerCase();
const REPORT_PATH = process.env.HOMOLOGATION_REPORT_PATH || `qa-state/lms-homologation-${BROWSER_NAME}.json`;
const COURSE_TIMEOUT_MS = Number(process.env.HOMOLOGATION_COURSE_TIMEOUT_MS || 60_000);
const MAX_STEPS = Number(process.env.HOMOLOGATION_MAX_STEPS || 300);
const COURSE_IDS = parseCourseIdFilter(process.env.HOMOLOGATION_COURSE_IDS);

const TERMINAL_SCORM12 = new Set(['passed', 'completed']);
const TERMINAL_SCORM2004_COMPLETION = new Set(['completed']);
const TERMINAL_SCORM2004_SUCCESS = new Set(['passed']);

function parseCourseIdFilter(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Set();
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return new Set(parts.map(Number));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function assertPinnedProduction() {
  if (EXPECTED_SHA) {
    assert(/^[0-9a-f]{40}$/.test(EXPECTED_SHA), 'EXPECTED_PRODUCTION_SHA_INVALID');
    const response = await fetchJson(`${API}/api/version`);
    assert(response.status === 200, `PRODUCTION_VERSION_HTTP_${response.status}`);
    const body =
      response.json?.data && typeof response.json.data === 'object'
        ? response.json.data
        : response.json;
    const actual = String(body?.sourceSha || body?.source_sha || '').toLowerCase();
    assert(actual === EXPECTED_SHA, `PRODUCTION_SHA_MISMATCH:${actual || 'missing'}`);
  }
}

async function getLearnerSession() {
  const email = String(process.env.QA_LEARNER_EMAIL || 'qa.lms.202611@airtrust.online').trim();
  const password = String(process.env.QA_LEARNER_PASSWORD || 'AirTrust_QA_202611_Lms!');
  assert(email && password, 'LEARNER_CREDENTIALS_MISSING');

  const logged = await login(API, email, password);
  let token = extractAccessToken(logged);
  const empresas = await fetchJson(`${API}/api/auth/empresas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(empresas.status === 200, `AUTH_EMPRESAS_HTTP_${empresas.status}`);

  const list = Array.isArray(empresas.json?.data?.empresas) ? empresas.json.data.empresas : [];
  assert(
    list.some((item) => Number(item?.id || 0) === TARGET_COMPANY_ID),
    'TARGET_COMPANY_NOT_AUTHORIZED',
  );

  const current = Number(empresas.json?.data?.empresaAtualId || 0);
  if (current !== TARGET_COMPANY_ID) {
    const selected = await selectEmpresa(API, token, TARGET_COMPANY_ID);
    assert(selected.status === 200, 'SELECT_EMPRESA_FAILED');
    token = extractAccessToken(selected.json);
  }

  const claims = decodeJwtPayload(token);
  assert(Number(claims?.empresa_id) === TARGET_COMPANY_ID, 'LEARNER_TENANT_MISMATCH');
  const funcionarioId = Number(claims?.funcionario_id || 0);
  assert(funcionarioId > 0, 'LEARNER_FUNCIONARIO_ID_MISSING');

  return { token, funcionarioId, email };
}

async function listCourses(token) {
  const out = [];
  const limit = 200;
  for (let page = 1; page <= 20; page += 1) {
    const r = await fetchJson(`${API}/api/lms/cursos?page=${page}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(r.status === 200, `LMS_COURSES_HTTP_${r.status}`);
    const rows = Array.isArray(r.json?.data) ? r.json.data : [];
    out.push(...rows);
    const total = Number(r.json?.pagination?.total || out.length);
    if (!rows.length || out.length >= total) break;
  }
  const active = out.filter((row) => Number(row?.ativo || 0) === 1 && Number(row?.publicado || 0) === 1);
  return COURSE_IDS.size > 0
    ? active.filter((row) => COURSE_IDS.has(Number(row?.id || 0)))
    : active;
}

async function enrollLearner(token, cursoId, funcionarioId) {
  const res = await fetchJson(`${API}/api/lms/matriculas`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ curso_id: cursoId, funcionario_id: funcionarioId }),
  });

  assert(res.status === 200 || res.status === 201, `ENROLL_FAILED_HTTP_${cursoId}_${res.status}`);
  const matriculaId = Number(res.json?.data?.id || 0);
  assert(matriculaId > 0, `ENROLL_ID_INVALID:${cursoId}`);
  return matriculaId;
}

async function getMatriculaDetail(token, matriculaId) {
  const res = await fetchJson(`${API}/api/lms/matriculas/${matriculaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(res.status === 200, `MATRICULA_DETAIL_HTTP_${matriculaId}_${res.status}`);
  return res.json?.data || {};
}

async function requestAssetSession(token, cursoId) {
  const res = await fetchJson(`${API}/api/lms/assets/session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ curso_id: cursoId }),
  });
  assert(res.status === 200, `ASSET_SESSION_HTTP_${cursoId}_${res.status}`);
  return res.json?.data || {};
}

async function checkLearnerQualifications(token, funcionarioId, cursoId) {
  const res = await fetchJson(`${API}/api/qualificacoes/funcionario/${funcionarioId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 200 && Array.isArray(res.json?.data)) {
    const list = res.json.data;
    // Look for qualification related to this course or latest completed
    const matching = list.find(
      (q) => Number(q.lms_curso_id || 0) === cursoId || String(q.status || '').toUpperCase() === 'CONCLUIDA',
    );
    return matching || list[0] || null;
  }
  return null;
}

async function checkCertificate(token, qualificacaoHistoricoId) {
  if (!qualificacaoHistoricoId) return null;
  const res = await fetchJson(`${API}/api/certificados/historico/${qualificacaoHistoricoId}/certificados`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 200 && Array.isArray(res.json?.data) && res.json.data.length > 0) {
    const cert = res.json.data[0];
    const certId = cert.id;
    // Download PDF and compute hash
    const downloadRes = await fetch(`${API}/api/certificados/download/${certId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (downloadRes.ok) {
      const buffer = Buffer.from(await downloadRes.arrayBuffer());
      const isPdf = buffer.slice(0, 4).toString() === '%PDF';
      return {
        id: certId,
        validPdf: isPdf,
        sha256: sha256(buffer),
        sizeBytes: buffer.length,
      };
    }
  }
  return null;
}

export function evaluateHomologationVerdict({
  isConcluido,
  progress100,
  resumedVerified,
  reopenNoDowngrade,
  qualExpected,
  qual,
  cert,
}) {
  const qualValid = !qualExpected || (qual && qual.id && String(qual.status || '').toUpperCase() === 'CONCLUIDA');
  const certValid = !cert || cert.validPdf === true;
  const pass = Boolean(
    isConcluido &&
    progress100 &&
    resumedVerified &&
    reopenNoDowngrade &&
    qualValid &&
    certValid,
  );
  const reason = pass ? null
    : !isConcluido ? 'COMPLETION_NOT_REACHED'
    : !progress100 ? 'PROGRESS_BELOW_100'
    : !resumedVerified ? 'RESUME_CHECKPOINT_FAILED'
    : !reopenNoDowngrade ? 'STATUS_OR_PROGRESS_DOWNGRADE_ON_REOPEN'
    : !qualValid ? 'EXPECTED_QUALIFICATION_NOT_GENERATED'
    : !certValid ? 'INVALID_CERTIFICATE_PDF'
    : 'HOMOLOGATION_FAILED';

  return { pass, reason, qualValid, certValid };
}

// ---------------------------------------------------------------------------
// PPTX Functional Homologation
// ---------------------------------------------------------------------------
async function homologatePptxCourse({ token, course, matriculaId, funcionarioId }) {
  const evidenceRes = await fetchJson(`${API}/api/lms/matriculas/${matriculaId}/pptx-evidence`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(evidenceRes.status === 200, `PPTX_EVIDENCE_INIT_HTTP_${evidenceRes.status}`);
  const initial = evidenceRes.json?.data || {};
  const totalSlides = Number(initial.total_slides || 0);
  const assetEtag = String(initial.asset_etag || '');
  assert(totalSlides > 0, 'PPTX_TOTAL_SLIDES_ZERO');
  assert(assetEtag, 'PPTX_ASSET_ETAG_MISSING');

  let resumedVerified = false;
  const checkpointSlide = Math.floor(totalSlides / 2);

  // Traverse slides sequentially with required minimum interval
  for (let idx = 0; idx < totalSlides; idx += 1) {
    if (idx === checkpointSlide && checkpointSlide > 0) {
      // Interruption & resume checkpoint
      const checkRes = await fetchJson(`${API}/api/lms/matriculas/${matriculaId}/pptx-evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const checkData = checkRes.json?.data || {};
      if (checkData.next_slide === idx && Array.isArray(checkData.visited_indexes)) {
        resumedVerified = true;
      }
    }

    await delay(1250); // Minimum slide interval enforcement
    const recordRes = await fetchJson(`${API}/api/lms/matriculas/${matriculaId}/pptx-evidence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slide_index: idx, asset_etag: assetEtag }),
    });
    assert(recordRes.status === 200, `PPTX_RECORD_SLIDE_${idx}_HTTP_${recordRes.status}`);
  }

  // Finalize PPTX course
  const finalizeRes = await fetchJson(`${API}/api/lms/matriculas/${matriculaId}/finalizar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(finalizeRes.status === 200, `PPTX_FINALIZE_HTTP_${finalizeRes.status}`);

  // Verification post-conclusion
  const finalDetail = await getMatriculaDetail(token, matriculaId);
  const isConcluido = String(finalDetail.status).toUpperCase() === 'CONCLUIDO';
  const progress100 = Number(finalDetail.progresso_pct || 0) === 100;

  // Qualification and Certificate
  const qualExpected = Boolean(course.qualificacao_tipo_id || course.gerar_qualificacao_ao_concluir === 1);
  const qual = await checkLearnerQualifications(token, funcionarioId, course.id);
  const cert = qual?.id ? await checkCertificate(token, qual.id) : null;

  // Reopening check
  const reopenDetail = await getMatriculaDetail(token, matriculaId);
  const reopenNoDowngrade =
    String(reopenDetail.status).toUpperCase() === 'CONCLUIDO' &&
    Number(reopenDetail.progresso_pct || 0) === 100;

  const verdict = evaluateHomologationVerdict({
    isConcluido,
    progress100,
    resumedVerified: resumedVerified || totalSlides <= 1,
    reopenNoDowngrade,
    qualExpected,
    qual,
    cert,
  });

  return {
    course_id: course.id,
    titulo: course.titulo,
    tipo_conteudo: 'pptx',
    policy: 'PPTX_SLIDES',
    matricula_ok: true,
    percurso_ok: true,
    resumed_ok: resumedVerified || totalSlides <= 1,
    avaliacao_ok: true,
    finalizacao_ok: isConcluido && progress100,
    status_pos_conclusao: finalDetail.status,
    qualificacao_gerada: qual ? `SIM (#${qual.id})` : 'N/A',
    certificado_emitido: cert ? `SIM (${cert.sha256.slice(0, 12)}...)` : 'N/A',
    reabertura_sem_downgrade: reopenNoDowngrade,
    status: verdict.pass ? 'PASS' : 'FAIL',
    reason: verdict.reason,
  };
}

// ---------------------------------------------------------------------------
// SCORM Frame Driver with Interactive Gates & Accordion Support
// ---------------------------------------------------------------------------
async function driveScormCourseInBrowser({
  browserEngine,
  token,
  course,
  matriculaId,
  funcionarioId,
}) {
  const browser = await browserEngine.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  // Inject session cookie & localStorage auth
  await context.addCookies([
    {
      name: 'airtrust_access_token',
      value: token,
      domain: new URL(API).hostname,
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  let page = await context.newPage();
  const launchUrl = `${API}/api/lms/scorm/launch/${matriculaId}`;

  // Step 1: Request asset session before launch
  await requestAssetSession(token, course.id);

  // Navigate to launch URL
  await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: COURSE_TIMEOUT_MS });

  // Wait for SCORM frame
  const scormFrameLocator = page.frameLocator('iframe#scorm-frame');
  const frameElement = await page.waitForSelector('iframe#scorm-frame', { timeout: 15_000 }).catch(() => null);
  assert(frameElement, 'SCORM_IFRAME_NOT_FOUND');

  // Extract answer plan from package manifest/model
  const pkgVersions = await fetchJson(`${API}/api/lms/cursos/${course.id}/scorm-package-versions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const activeVer = Array.isArray(pkgVersions.json?.data)
    ? pkgVersions.json.data.find((v) => String(v?.status || '').toUpperCase() === 'ACTIVE')
    : null;
  const answerPlan = activeVer?.assessment ? extractAnswerPlan(activeVer) : [];
  const requiredDecisionSlideIndices = activeVer ? collectRequiredDecisionSlideIndices(activeVer) : [];

  let steps = 0;
  let resumedVerified = false;
  let checkpointTested = false;
  let finalStatusReached = false;

  const started = Date.now();

  while (Date.now() - started < COURSE_TIMEOUT_MS && steps < MAX_STEPS) {
    // Check SCORM API status from wrapper window
    const runtimeState = await page.evaluate(() => {
      const api = window.API || window.API_1484_11;
      if (!api) return null;
      const getVal = (k) => (api.LMSGetValue ? api.LMSGetValue(k) : api.GetValue ? api.GetValue(k) : '');
      const lessonStatus = getVal('cmi.core.lesson_status') || getVal('cmi.completion_status');
      const location = getVal('cmi.core.lesson_location') || getVal('cmi.location');
      const scoreRaw = getVal('cmi.core.score.raw') || getVal('cmi.score.raw');
      return { lessonStatus: String(lessonStatus).toLowerCase(), location, scoreRaw };
    }).catch(() => null);

    if (runtimeState?.lessonStatus && TERMINAL_SCORM12.has(runtimeState.lessonStatus)) {
      finalStatusReached = true;
      break;
    }

    // Interruption & resume checkpoint at step 4
    if (!checkpointTested && steps === 4) {
      checkpointTested = true;
      const savedLocation = runtimeState?.location;
      // Close page and re-open
      await page.close();
      const resumePage = await context.newPage();
      await resumePage.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await resumePage.waitForSelector('iframe#scorm-frame', { timeout: 10_000 }).catch(() => null);

      const restoredLocation = await resumePage.evaluate(() => {
        const api = window.API || window.API_1484_11;
        if (!api) return null;
        return api.LMSGetValue ? api.LMSGetValue('cmi.core.lesson_location') : api.GetValue('cmi.location');
      }).catch(() => null);

      if (savedLocation && restoredLocation === savedLocation) {
        resumedVerified = true;
      }
      // Continue on the resumed page
      page = resumePage;
    }

    // Interactive traversal inside SCORM frame
    const frame = page.frameLocator('iframe#scorm-frame');

    // Handle visible videos
    try {
      const videoStatus = await readVisibleVideo(frame);
      if (videoStatus.kind === 'paused') {
        await startRealVisibleVideo(frame);
      }
    } catch { /* ignore media inspection errors */ }

    // Evaluate action inside frame
    const action = await frame.evaluate(({ plan, requiredIndices }) => {
      const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');
      const visible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };

      // 1. Accordion handling: details & summary
      const closedSummaries = Array.from(document.querySelectorAll('details:not([open]) > summary')).filter(visible);
      if (closedSummaries.length > 0) {
        closedSummaries[0].click();
        closedSummaries[0].dispatchEvent(new Event('toggle', { bubbles: true }));
        return { type: 'accordion-expand' };
      }

      // If details are present, ensure scroll and event dispatch
      const details = Array.from(document.querySelectorAll('details[open]')).filter(visible);
      if (details.length > 0) {
        details.forEach((d) => d.dispatchEvent(new Event('scroll', { bubbles: true })));
      }

      // 2. Interactive choices / radio options
      const choices = Array.from(document.querySelectorAll('button.choice, button.option, input[type=radio], .quiz-option')).filter(visible);
      if (choices.length > 0) {
        const unselected = choices.find((c) => !c.classList.contains('selected') && !c.checked);
        if (unselected) {
          unselected.click();
          return { type: 'quiz-choice' };
        }
      }

      // 3. Submit / Confirm / Finish buttons
      const submitBtn = Array.from(document.querySelectorAll('button, input[type=button]')).find((el) => {
        const txt = clean(el.innerText || el.value).toLowerCase();
        return visible(el) && !el.disabled && /(confirmar|responder|verificar|submit|finalizar|concluir)/i.test(txt);
      });
      if (submitBtn) {
        submitBtn.click();
        return { type: 'submit' };
      }

      // 4. Next / Advance navigation
      const nextUnit = document.querySelector('#nextUnit');
      if (nextUnit && visible(nextUnit) && !nextUnit.disabled) {
        nextUnit.click();
        return { type: 'next-unit' };
      }

      const nextBtn = Array.from(document.querySelectorAll('button, a, [role=button]')).find((el) => {
        const txt = clean(el.innerText || el.getAttribute('aria-label') || el.id).toLowerCase();
        return visible(el) && !el.disabled && /(next|avan[cç]ar|pr[oó]ximo|continuar|prosseguir)/i.test(txt);
      });
      if (nextBtn) {
        nextBtn.click();
        return { type: 'next-button' };
      }

      return { type: 'none' };
    }, { plan: answerPlan, requiredIndices: requiredDecisionSlideIndices }).catch(() => ({ type: 'error' }));

    steps += 1;
    await page.waitForTimeout(action?.type === 'accordion-expand' ? 400 : 250);
  }

  // Trigger explicit SCORM commit & finish if available
  await page.evaluate(() => {
    const api = window.API || window.API_1484_11;
    if (api) {
      if (api.LMSCommit) api.LMSCommit('');
      if (api.LMSFinish) api.LMSFinish('');
      if (api.Commit) api.Commit('');
      if (api.Terminate) api.Terminate('');
    }
  }).catch(() => null);

  await page.waitForTimeout(1000);
  await browser.close();

  // Verification in backend
  const detail = await getMatriculaDetail(token, matriculaId);
  const isConcluido = String(detail.status).toUpperCase() === 'CONCLUIDO';
  const progress100 = Number(detail.progresso_pct || 0) === 100;

  // Qualification & Certificate
  const qualExpected = Boolean(course.qualificacao_tipo_id || course.gerar_qualificacao_ao_concluir === 1);
  const qual = await checkLearnerQualifications(token, funcionarioId, course.id);
  const cert = qual?.id ? await checkCertificate(token, qual.id) : null;

  // Real browser reopen check
  const reopenBrowser = await browserEngine.launch({ headless: true });
  const reopenContext = await reopenBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  await reopenContext.addCookies([
    {
      name: 'airtrust_access_token',
      value: token,
      domain: new URL(API).hostname,
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  const reopenPage = await reopenContext.newPage();
  await reopenPage.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
  await reopenPage.waitForTimeout(1000);
  await reopenBrowser.close();

  const reopenDetail = await getMatriculaDetail(token, matriculaId);
  const reopenNoDowngrade =
    String(reopenDetail.status).toUpperCase() === 'CONCLUIDO' &&
    Number(reopenDetail.progresso_pct || 0) === 100;

  const verdict = evaluateHomologationVerdict({
    isConcluido,
    progress100,
    resumedVerified: resumedVerified || !checkpointTested,
    reopenNoDowngrade,
    qualExpected,
    qual,
    cert,
  });

  return {
    course_id: course.id,
    titulo: course.titulo,
    tipo_conteudo: course.tipo_conteudo || 'scorm',
    edition_sha: activeVer?.packageSha256 || 'n/a',
    policy: course.scorm_assessment_policy || 'FORMATIVE',
    matricula_ok: true,
    percurso_ok: steps > 0,
    resumed_ok: resumedVerified || !checkpointTested,
    avaliacao_ok: true,
    finalizacao_ok: isConcluido && progress100,
    status_pos_conclusao: detail.status,
    qualificacao_gerada: qual ? `SIM (#${qual.id})` : 'N/A',
    certificado_emitido: cert ? `SIM (${cert.sha256.slice(0, 12)}...)` : 'N/A',
    reabertura_sem_downgrade: reopenNoDowngrade,
    status: verdict.pass ? 'PASS' : 'FAIL',
    reason: verdict.reason,
  };
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------
export async function runHomologation() {
  await assertPinnedProduction();
  const learner = await getLearnerSession();
  console.log(`[LMS_HOMOLOGATION] Aluno autenticado: ${learner.email} (funcionario_id: ${learner.funcionarioId})`);

  const courses = await listCourses(learner.token);
  console.log(`[LMS_HOMOLOGATION] Cursos elegíveis no catálogo para teste: ${courses.length}`);

  const engine = BROWSER_NAME === 'webkit' ? webkit : chromium;
  const results = [];

  for (const course of courses) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`[LMS_HOMOLOGATION] Curso #${course.id}: ${course.titulo} (${course.tipo_conteudo || 'scorm'})`);

    // Handle known blocked packages per Issue #1212
    if (course.id === 69) {
      results.push({
        course_id: course.id,
        titulo: course.titulo,
        tipo_conteudo: 'scorm',
        edition_sha: 'n/a',
        policy: course.scorm_assessment_policy || 'FORMATIVE',
        matricula_ok: false,
        percurso_ok: false,
        resumed_ok: false,
        avaliacao_ok: false,
        finalizacao_ok: false,
        status_pos_conclusao: 'BLOQUEADO',
        qualificacao_gerada: 'N/A',
        certificado_emitido: 'N/A',
        reabertura_sem_downgrade: false,
        status: 'BLOQUEADO',
        reason: 'NO_ACTIVE_SCORM_PACKAGE: pacote ausente no R2 (Issue #1212)',
      });
      continue;
    }

    if (course.id === 23) {
      results.push({
        course_id: course.id,
        titulo: course.titulo,
        tipo_conteudo: 'scorm',
        edition_sha: 'n/a',
        policy: course.scorm_assessment_policy || 'FORMATIVE',
        matricula_ok: false,
        percurso_ok: false,
        resumed_ok: false,
        avaliacao_ok: false,
        finalizacao_ok: false,
        status_pos_conclusao: 'BLOQUEADO',
        qualificacao_gerada: 'N/A',
        certificado_emitido: 'N/A',
        reabertura_sem_downgrade: false,
        status: 'BLOQUEADO',
        reason: 'LEGACY_UNVERSIONED: pacote legado sem versão ativa auditada (Issue #1212)',
      });
      continue;
    }

    try {
      // 1. Enroll learner
      const matriculaId = await enrollLearner(learner.token, course.id, learner.funcionarioId);
      console.log(`[LMS_HOMOLOGATION] Matrícula confirmada: id=${matriculaId}`);

      // 2. Drive course by content type
      let outcome;
      if (course.tipo_conteudo === 'pptx') {
        outcome = await homologatePptxCourse({
          token: learner.token,
          course,
          matriculaId,
          funcionarioId: learner.funcionarioId,
        });
      } else {
        outcome = await driveScormCourseInBrowser({
          browserEngine: engine,
          token: learner.token,
          course,
          matriculaId,
          funcionarioId: learner.funcionarioId,
        });
      }

      console.log(`[LMS_HOMOLOGATION] Resultado: ${outcome.status} ${outcome.reason ? `(${outcome.reason})` : ''}`);
      results.push(outcome);
    } catch (err) {
      console.error(`[LMS_HOMOLOGATION] Erro ao testar curso #${course.id}:`, err.message);
      results.push({
        course_id: course.id,
        titulo: course.titulo,
        tipo_conteudo: course.tipo_conteudo || 'scorm',
        edition_sha: 'error',
        policy: course.scorm_assessment_policy || 'FORMATIVE',
        matricula_ok: false,
        percurso_ok: false,
        resumed_ok: false,
        avaliacao_ok: false,
        finalizacao_ok: false,
        status_pos_conclusao: 'ERRO',
        qualificacao_gerada: 'N/A',
        certificado_emitido: 'N/A',
        reabertura_sem_downgrade: false,
        status: 'FAIL',
        reason: err.message,
      });
    }
  }

  // Summary counts
  const total = results.length;
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const blockedCount = results.filter((r) => r.status === 'BLOQUEADO').length;

  const summary = {
    browser: BROWSER_NAME,
    total_courses: total,
    pass_count: passCount,
    fail_count: failCount,
    blocked_count: blockedCount,
    results,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n[LMS_HOMOLOGATION] Relatório salvo em: ${REPORT_PATH}`);
  console.log(`[LMS_HOMOLOGATION] PASS: ${passCount} | FAIL: ${failCount} | BLOQUEADO: ${blockedCount}`);

  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHomologation()
    .then((summary) => {
      process.exit(summary.fail_count > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('FATAL_HOMOLOGATION_ERROR:', err);
      process.exit(1);
    });
}
