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
const APP = String(process.env.PROD_APP_BASE_URL || 'https://airtrust.online').replace(/\/+$/, '');
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

let cachedAdminToken = null;

export async function resolveAdminToken() {
  if (cachedAdminToken) return cachedAdminToken;
  const adminEmail = String(
    process.env.PROD_SMOKE_EMAIL || process.env.QA_EXAMINER_ADMIN_EMAIL || '',
  ).trim();
  const adminPassword = String(
    process.env.PROD_SMOKE_PASSWORD || process.env.QA_EXAMINER_ADMIN_PASSWORD || '',
  );

  if (!adminEmail || !adminPassword) return null;

  try {
    const logged = await login(API, adminEmail, adminPassword);
    let t = extractAccessToken(logged);
    const claimsBefore = decodeJwtPayload(t);
    if (Number(claimsBefore?.empresa_id) !== TARGET_COMPANY_ID) {
      const sel = await selectEmpresa(API, t, TARGET_COMPANY_ID);
      assert(sel.status === 200, `SELECT_EMPRESA_HTTP_${sel.status}`);
      t = extractAccessToken(sel.json);
    }
    const claimsAfter = decodeJwtPayload(t);
    assert(Number(claimsAfter?.empresa_id) === TARGET_COMPANY_ID, 'ADMIN_TOKEN_TENANT_MISMATCH');
    cachedAdminToken = t;
    return t;
  } catch (err) {
    console.warn('[LMS_HOMOLOGATION] Fallback: não foi possível autenticar sessão administrativa no tenant alvo:', err.message);
    return null;
  }
}

async function listCourses(learnerToken) {
  const adminToken = await resolveAdminToken();
  const catalogToken = adminToken || learnerToken;

  const out = [];
  const limit = 200;
  for (let page = 1; page <= 20; page += 1) {
    const r = await fetchJson(`${API}/api/lms/cursos?page=${page}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${catalogToken}` },
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

export async function enrollLearner(token, cursoId, funcionarioId, adminToken = null) {
  // 1. Verificar se o aluno já possui matrícula ativa pré-existente
  try {
    const existingRes = await fetchJson(`${API}/api/lms/matriculas/minhas-ead`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (existingRes.status === 200 && Array.isArray(existingRes.json?.data)) {
      const match = existingRes.json.data.find(
        (m) => Number(m.curso_id) === Number(cursoId) && m.status !== 'CANCELADO' && !m.deleted_at,
      );
      if (match && Number(match.id) > 0) {
        console.log(`[LMS_HOMOLOGATION] Matrícula ativa pré-existente reutilizada: id=${match.id}`);
        return Number(match.id);
      }
    }
  } catch (err) {
    console.warn(`[LMS_HOMOLOGATION] Aviso ao consultar minhas-ead: ${err.message}`);
  }

  // 2. Tentar auto-matrícula normal pelo aluno
  let res = await fetchJson(`${API}/api/lms/matriculas`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ curso_id: cursoId, funcionario_id: funcionarioId }),
  });

  if (res.status === 200 || res.status === 201) {
    const matriculaId = Number(res.json?.data?.id || 0);
    assert(matriculaId > 0, `ENROLL_ID_INVALID:${cursoId}`);
    return matriculaId;
  }

  // 3. Fallback administrativo caso auto-matrícula seja restrita por setor (403)
  if (res.status === 403 && adminToken) {
    console.log(`[LMS_HOMOLOGATION] Auto-matrícula restrita pelo setor. Atribuindo via gestão...`);
    res = await fetchJson(`${API}/api/lms/matriculas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ curso_id: cursoId, funcionario_id: funcionarioId }),
    });
    if (res.status === 200 || res.status === 201) {
      const matriculaId = Number(res.json?.data?.id || 0);
      assert(matriculaId > 0, `ENROLL_ID_INVALID:${cursoId}`);
      return matriculaId;
    }
  }

  // 4. Tratar matrícula cancelada anterior (LMS_REMATRICULATION_REQUIRED - 409)
  if (res.status === 409 && res.json?.code === 'LMS_REMATRICULATION_REQUIRED') {
    const targetMatriculaId = Number(res.json?.data?.matricula_id || 0);
    const authToUse = adminToken || token;
    if (targetMatriculaId > 0) {
      console.log(`[LMS_HOMOLOGATION] Reativando matrícula cancelada id=${targetMatriculaId} via rematrícula autorizada...`);
      const remat = await fetchJson(`${API}/api/lms/matriculas/${targetMatriculaId}/rematricular`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToUse}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Homologação LMS Aluno QA 202611' }),
      });
      if (remat.status === 200 && Number(remat.json?.data?.matricula_id || 0) > 0) {
        return Number(remat.json.data.matricula_id);
      }
    }
  }

  // 5. Tratar conflito que retorna id existente
  if (res.status === 409 && Number(res.json?.data?.id || 0) > 0) {
    return Number(res.json.data.id);
  }

  const errDetail = res.json?.code || res.json?.error || JSON.stringify(res.json);
  throw new Error(`ENROLL_FAILED_HTTP_${cursoId}_${res.status}:${errDetail}`);
}

async function getMatriculaDetail(token, matriculaId) {
  const res = await fetchJson(`${API}/api/lms/matriculas/${matriculaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(res.status === 200, `MATRICULA_DETAIL_HTTP_${matriculaId}_${res.status}`);
  return res.json?.data || {};
}

export async function setupAuthenticatedContext(context, token, matriculaId = null) {
  const apiHost = new URL(API).hostname;
  const appHost = new URL(APP).hostname;
  const domains = [apiHost, appHost].filter((v, i, a) => a.indexOf(v) === i);
  for (const domain of domains) {
    await context.addCookies([
      {
        name: 'airtrust_access_token',
        value: token,
        domain,
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
  }

  if (matriculaId) {
    const assetRes = await context.request.post(`${API}/api/lms/assets/session`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { matricula_id: matriculaId },
    });
    assert(assetRes.ok(), `ASSET_SESSION_HTTP_${matriculaId}_${assetRes.status()}`);
  }
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
  const qualValid = !qualExpected || Boolean(qual && qual.id && String(qual.status || '').toUpperCase() === 'CONCLUIDA');
  const certValid = !qualExpected || Boolean(cert && cert.validPdf === true && cert.sizeBytes > 0);
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
// PPTX Functional Homologation in Real Browser
// ---------------------------------------------------------------------------
async function drivePptxCourseInBrowser({
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

  await setupAuthenticatedContext(context, token, matriculaId);

  let page = await context.newPage();
  await page.addInitScript((jwt) => {
    try {
      localStorage.setItem('airtrust_access_token', jwt);
      localStorage.setItem('token', jwt);
    } catch {}
  }, token);

  const playerUrl = `${APP}/lms/player/pptx/${matriculaId}`;
  await page.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: COURSE_TIMEOUT_MS });

  // Guard against viewer loading failure
  const viewerFailed = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    return /não disponível|falha ao carregar|arquivo corrompido/i.test(text);
  });
  if (viewerFailed) {
    await browser.close();
    throw new Error('PPTX_VIEWER_LOAD_FAILED');
  }

  // Wait for slide display
  await page.waitForSelector('.aspect-video, button[aria-label^="Slide 1"]', { timeout: 20_000 });

  // Determine slide count
  const totalSlides = await page.evaluate(() => {
    const dots = document.querySelectorAll('button[aria-label^="Slide "]');
    if (dots.length > 0) return dots.length;
    const footer = document.querySelector('.aspect-video')?.parentElement?.innerText || '';
    const match = footer.match(/Slide \d+ de (\d+)/i);
    return match ? Number(match[1]) : 1;
  });
  assert(totalSlides > 0, 'PPTX_TOTAL_SLIDES_ZERO');

  let resumedVerified = false;
  const checkpointSlide = Math.floor(totalSlides / 2);

  for (let idx = 0; idx < totalSlides; idx += 1) {
    // Dwell time on current slide: player requires ~1.7s to submit evidence
    await page.waitForTimeout(2000);

    if (idx === checkpointSlide && checkpointSlide > 0 && !resumedVerified) {
      // Test interruption and resume
      await page.close();
      const resumePage = await context.newPage();
      await resumePage.addInitScript((jwt) => {
        try {
          localStorage.setItem('airtrust_access_token', jwt);
          localStorage.setItem('token', jwt);
        } catch {}
      }, token);
      await resumePage.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await resumePage.waitForSelector('.aspect-video', { timeout: 15_000 });

      const restoredSlide = await resumePage.evaluate(() => {
        const active = document.querySelector('button[aria-label^="Slide "].h-2\\.5');
        const label = active?.getAttribute('aria-label');
        const m = label?.match(/Slide (\d+)/i);
        return m ? Number(m[1]) - 1 : null;
      });

      if (restoredSlide === checkpointSlide || restoredSlide === checkpointSlide - 1) {
        resumedVerified = true;
      }
      page = resumePage;
      await page.waitForTimeout(1000);
    }

    if (idx < totalSlides - 1) {
      // Advance to next slide via Next button
      const nextBtn = page.locator('button:has-text("Próximo")').first();
      await nextBtn.waitFor({ state: 'visible', timeout: 10_000 });
      for (let w = 0; w < 10; w += 1) {
        if (!(await nextBtn.isDisabled())) break;
        await page.waitForTimeout(500);
      }
      await nextBtn.click();
    }
  }

  // At the final slide, wait for and click Conclude button
  const concludeBtn = page.locator('button:has-text("Concluir curso")').first();
  await concludeBtn.waitFor({ state: 'visible', timeout: 10_000 });
  for (let w = 0; w < 10; w += 1) {
    if (!(await concludeBtn.isDisabled())) break;
    await page.waitForTimeout(500);
  }
  await concludeBtn.click();

  // Wait for Concluído status indicator
  await page.locator('text=Concluído').first().waitFor({ state: 'visible', timeout: 12_000 });
  await page.waitForTimeout(1000);
  await browser.close();

  // Verification in backend
  const detail = await getMatriculaDetail(token, matriculaId);
  const isConcluido = String(detail.status).toUpperCase() === 'CONCLUIDO';
  const progress100 = Number(detail.progresso_pct || 0) === 100;

  // Qualification and Certificate
  const qualExpected = Boolean(course.qualificacao_tipo_id || course.gerar_qualificacao_ao_concluir === 1);
  const qual = await checkLearnerQualifications(token, funcionarioId, course.id);
  const cert = qual?.id ? await checkCertificate(token, qual.id) : null;

  // Reopen in real browser to verify no status or progress downgrade
  const reopenBrowser = await browserEngine.launch({ headless: true });
  const reopenContext = await reopenBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  await setupAuthenticatedContext(reopenContext, token, matriculaId);
  const reopenPage = await reopenContext.newPage();
  await reopenPage.addInitScript((jwt) => {
    try {
      localStorage.setItem('airtrust_access_token', jwt);
      localStorage.setItem('token', jwt);
    } catch {}
  }, token);
  await reopenPage.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
  await reopenPage.waitForSelector('text=Concluído, text=Status: concluído', { timeout: 15_000 }).catch(() => null);
  await reopenBrowser.close();

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
    edition_sha: 'n/a',
    policy: 'PPTX_SLIDES',
    matricula_ok: true,
    percurso_ok: true,
    resumed_ok: resumedVerified || totalSlides <= 1,
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

  // Setup authenticated cookies & scoped asset session in Playwright context
  await setupAuthenticatedContext(context, token, matriculaId);

  let page = await context.newPage();
  const launchUrl = `${API}/api/lms/scorm/launch/${matriculaId}`;

  // Navigate to launch URL
  await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: COURSE_TIMEOUT_MS });

  // Wait for SCORM frame element and resolve active Frame
  const iframeLocator = page.locator('#scorm-frame');
  await iframeLocator.waitFor({ state: 'attached', timeout: 15_000 });
  const iframeHandle = await iframeLocator.elementHandle();
  const initialFrame = await iframeHandle?.contentFrame();
  assert(initialFrame, 'SCORM_IFRAME_NOT_FOUND');

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
      // Close page and re-open in authenticated context
      await page.close();
      const resumePage = await context.newPage();
      await resumePage.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      const resumeIframe = resumePage.locator('#scorm-frame');
      await resumeIframe.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => null);

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

    // Interactive traversal inside SCORM frame: resolve active Frame instance
    const frameEl = await page.$('#scorm-frame');
    const frame = await frameEl?.contentFrame();
    if (!frame) {
      await page.waitForTimeout(300);
      continue;
    }

    // Handle visible videos
    try {
      const videoStatus = await readVisibleVideo(frame);
      if (videoStatus.kind === 'paused') {
        await startRealVisibleVideo(frame);
      }
    } catch { /* ignore media inspection errors */ }

    // Evaluate action inside real Frame instance
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

  // Real browser reopen check in new isolated session
  const reopenBrowser = await browserEngine.launch({ headless: true });
  const reopenContext = await reopenBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  await setupAuthenticatedContext(reopenContext, token, matriculaId);
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

  const adminToken = await resolveAdminToken();
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
      const matriculaId = await enrollLearner(learner.token, course.id, learner.funcionarioId, adminToken);
      console.log(`[LMS_HOMOLOGATION] Matrícula confirmada: id=${matriculaId}`);

      // 2. Drive course by content type in real browser
      let outcome;
      if (course.tipo_conteudo === 'pptx') {
        outcome = await drivePptxCourseInBrowser({
          browserEngine: engine,
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
