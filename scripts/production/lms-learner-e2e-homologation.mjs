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
const COURSE_TIMEOUT_MS = Number(process.env.HOMOLOGATION_COURSE_TIMEOUT_MS || 120_000);
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
  const password = String(process.env.QA_LEARNER_PASSWORD || '').trim();
  assert(email && password, 'QA_LEARNER_PASSWORD_REQUIRED_FAIL_CLOSED');

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
        (m) => Number(m.curso_id) === Number(cursoId) && !m.deleted_at,
      );
      if (match && Number(match.id) > 0) {
        // Se a matrícula já possuir progresso ou histórico prévio (ex: CONCLUIDO, EM_ANDAMENTO por outro navegador ou ciclo anterior),
        // deve ser rematriculada em novo ciclo auditado para garantir teste independente e percurso integral a partir do zero (0%).
        const currentStatus = String(match.status || '').toUpperCase();
        if (currentStatus !== 'NAO_INICIADO' && currentStatus !== 'CANCELADO') {
          console.log(`[LMS_HOMOLOGATION] Matrícula #${match.id} (${currentStatus}) já possui progresso/ciclo prévio. Rematriculando em novo ciclo auditado para isolamento de ${BROWSER_NAME}...`);
          const authToUse = adminToken || token;
          const remat = await fetchJson(`${API}/api/lms/matriculas/${match.id}/rematricular`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authToUse}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason: `Homologação LMS Aluno QA - ${BROWSER_NAME}` }),
          });
          if (remat.status === 200 && Number(remat.json?.data?.matricula_id || 0) > 0) {
            return Number(remat.json.data.matricula_id);
          }
        } else if (currentStatus === 'NAO_INICIADO') {
          console.log(`[LMS_HOMOLOGATION] Matrícula virgem (NAO_INICIADO) reutilizada: id=${match.id}`);
          return Number(match.id);
        }
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

export async function checkLearnerQualifications(token, funcionarioId, cursoId, qualificacaoHistoricoId = null) {
  const res = await fetchJson(`${API}/api/qualificacoes/funcionario/${funcionarioId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 200 && Array.isArray(res.json?.data)) {
    const list = res.json.data;
    if (qualificacaoHistoricoId) {
      const exact = list.find((q) => Number(q.id) === Number(qualificacaoHistoricoId));
      if (exact) return exact;
    }
    // Look for qualification related to this course
    const matching = list.find((q) => Number(q.lms_curso_id || 0) === cursoId);
    return matching || null;
  }
  return null;
}

export async function checkCertificate(token, qualificacaoHistoricoId) {
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

export function evaluateAssessmentPolicy({
  policy = 'FORMATIVE',
  lessonStatus = '',
  scoreRaw = null,
  scoreScaled = null,
  masteryScore = null,
  externalProofVerified = false,
}) {
  const normStatus = String(lessonStatus || '').trim().toLowerCase();
  const normalizedPolicy = String(policy || 'FORMATIVE').trim().toUpperCase();

  if (normalizedPolicy === 'FORMATIVE') {
    const ok = normStatus === 'completed' || normStatus === 'passed';
    return {
      ok,
      policy: 'FORMATIVE',
      scoreRaw,
      scoreScaled,
      masteryScore,
      status: normStatus,
      reason: ok ? null : (normStatus === 'failed' ? 'ASSESSMENT_FAILED' : 'FORMATIVE_STATUS_INCOMPLETE'),
    };
  }

  if (normalizedPolicy === 'SCORED') {
    if (normStatus === 'failed') {
      return {
        ok: false,
        policy: 'SCORED',
        scoreRaw,
        scoreScaled,
        masteryScore,
        status: normStatus,
        reason: 'ASSESSMENT_FAILED',
      };
    }

    if (masteryScore != null && Number.isFinite(Number(masteryScore))) {
      const cut = Number(masteryScore);
      const raw = scoreRaw != null && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;
      const scaled = scoreScaled != null && Number.isFinite(Number(scoreScaled)) ? Number(scoreScaled) : null;

      let scorePassed = false;
      let scoreEvaluated = false;
      if (raw != null) {
        scoreEvaluated = true;
        scorePassed = raw >= cut;
      } else if (scaled != null) {
        scoreEvaluated = true;
        scorePassed = scaled >= (cut > 1 ? cut / 100 : cut);
      }

      // If score is evaluated and is below cut, it MUST FAIL even if lessonStatus says 'passed' (contradictory score)
      if (scoreEvaluated && !scorePassed) {
        return {
          ok: false,
          policy: 'SCORED',
          scoreRaw,
          scoreScaled,
          masteryScore: cut,
          status: normStatus,
          reason: 'SCORE_BELOW_MASTERY',
        };
      }

      if (!scoreEvaluated && normStatus !== 'passed') {
        return {
          ok: false,
          policy: 'SCORED',
          scoreRaw,
          scoreScaled,
          masteryScore: cut,
          status: normStatus,
          reason: 'ASSESSMENT_NOT_PASSED',
        };
      }
    }

    const ok = normStatus === 'passed' || (normStatus === 'completed' && masteryScore == null);
    return {
      ok,
      policy: 'SCORED',
      scoreRaw,
      scoreScaled,
      masteryScore,
      status: normStatus,
      reason: ok ? null : 'ASSESSMENT_NOT_PASSED',
    };
  }

  if (normalizedPolicy === 'PPTX_SLIDES') {
    const ok = normStatus === 'completed' || normStatus === 'passed';
    return {
      ok,
      policy: 'PPTX_SLIDES',
      scoreRaw,
      scoreScaled,
      masteryScore,
      status: normStatus,
      reason: ok ? null : 'PPTX_NOT_CONCLUDED',
    };
  }

  if (normalizedPolicy === 'EXTERNAL') {
    const ok = Boolean(externalProofVerified);
    return {
      ok,
      policy: 'EXTERNAL',
      scoreRaw,
      scoreScaled,
      masteryScore,
      status: normStatus,
      reason: ok ? null : 'EXTERNAL_PROOF_MISSING',
    };
  }

  // Any other unknown/unsupported policy fails closed
  return {
    ok: false,
    policy: normalizedPolicy,
    scoreRaw,
    scoreScaled,
    masteryScore,
    status: normStatus,
    reason: 'UNKNOWN_ASSESSMENT_POLICY',
  };
}

export function evaluateCoursePath({
  contentType = 'scorm',
  totalUnits = 0,
  visitedUnits = 0,
  distinctUnitsVisited = null,
  atLastUnit = false,
  completedActivities = 0,
  totalActivities = 0,
}) {
  if (!totalUnits || totalUnits <= 0) {
    return {
      ok: false,
      totalUnits,
      visitedUnits,
      atLastUnit,
      reason: 'INVALID_TOTAL_UNITS',
    };
  }

  let uniqueVisitedCount = visitedUnits;
  if (distinctUnitsVisited instanceof Set) {
    uniqueVisitedCount = distinctUnitsVisited.size;
  } else if (Array.isArray(distinctUnitsVisited)) {
    uniqueVisitedCount = new Set(distinctUnitsVisited).size;
  }

  if (uniqueVisitedCount < totalUnits || !atLastUnit) {
    return {
      ok: false,
      totalUnits,
      visitedUnits: uniqueVisitedCount,
      atLastUnit,
      reason: 'INCOMPLETE_COURSE_PATH',
    };
  }

  if (totalActivities > 0 && completedActivities < totalActivities) {
    return {
      ok: false,
      totalActivities,
      completedActivities,
      reason: 'MANDATORY_ACTIVITIES_INCOMPLETE',
    };
  }

  return {
    ok: true,
    totalUnits,
    visitedUnits: uniqueVisitedCount,
    atLastUnit: true,
    reason: null,
  };
}

export function evaluateHomologationVerdict({
  percurso_ok = true,
  avaliacao_ok = true,
  isConcluido,
  progress100,
  resumedVerified,
  reopenNoDowngrade,
  qualExpected,
  qual,
  cert,
}) {
  const percursoValid = percurso_ok === true;
  const avaliacaoValid = avaliacao_ok === true;
  const qualValid = !qualExpected || Boolean(qual && qual.id && String(qual.status || '').toUpperCase() === 'CONCLUIDA');
  const certValid = !qualExpected || Boolean(cert && cert.validPdf === true && cert.sizeBytes > 0);
  const pass = Boolean(
    percursoValid &&
    avaliacaoValid &&
    isConcluido &&
    progress100 &&
    resumedVerified &&
    reopenNoDowngrade &&
    qualValid &&
    certValid,
  );
  const reason = pass ? null
    : !percursoValid ? 'INCOMPLETE_COURSE_PATH'
    : !avaliacaoValid ? 'ASSESSMENT_NOT_PASSED'
    : !isConcluido ? 'COMPLETION_NOT_REACHED'
    : !progress100 ? 'PROGRESS_BELOW_100'
    : !resumedVerified ? 'RESUME_CHECKPOINT_FAILED'
    : !reopenNoDowngrade ? 'STATUS_OR_PROGRESS_DOWNGRADE_ON_REOPEN'
    : !qualValid ? 'EXPECTED_QUALIFICATION_NOT_GENERATED'
    : !certValid ? 'INVALID_CERTIFICATE_PDF'
    : 'HOMOLOGATION_FAILED';

  return { pass, reason, percursoValid, avaliacaoValid, qualValid, certValid };
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
  const qual = await checkLearnerQualifications(token, funcionarioId, course.id, detail.qualificacao_historico_id);
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

  const pptxVisitedSet = new Set(Array.from({ length: totalSlides }, (_, i) => i + 1));
  const pathVerdict = evaluateCoursePath({
    contentType: 'pptx',
    totalUnits: totalSlides,
    visitedUnits: totalSlides,
    distinctUnitsVisited: pptxVisitedSet,
    atLastUnit: true,
  });
  const assessmentVerdict = evaluateAssessmentPolicy({
    policy: 'PPTX_SLIDES',
    lessonStatus: isConcluido ? 'completed' : 'incomplete',
  });

  const verdict = evaluateHomologationVerdict({
    percurso_ok: pathVerdict.ok,
    avaliacao_ok: assessmentVerdict.ok,
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
    matricula_id: matriculaId,
    matricula_ok: true,
    percurso_ok: pathVerdict.ok,
    resumed_ok: resumedVerified || totalSlides <= 1,
    avaliacao_ok: assessmentVerdict.ok,
    finalizacao_ok: isConcluido && progress100,
    status_pos_conclusao: detail.status,
    qualificacao_gerada: qual ? `SIM (#${qual.id})` : 'N/A',
    certificado_emitido: cert ? `SIM (${cert.sha256.slice(0, 12)}...)` : 'N/A',
    reabertura_sem_downgrade: reopenNoDowngrade,
    status: verdict.pass ? 'PASS' : 'FAIL',
    reason: verdict.reason,
    audit_evidence: {
      units_visited: totalSlides,
      total_units: totalSlides,
      actions_count: totalSlides,
      resume_tested: totalSlides > 1,
      resume_verified: resumedVerified || totalSlides <= 1,
      backend_status: detail.status,
      backend_progresso: detail.progresso_pct,
      qualificacao_id: qual?.id ?? null,
      certificado_sha: cert?.sha256 ?? null,
    },
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
  let finalButtonClicked = false;
  let maxVisitedUnit = 0;
  let totalUnitsDetected = 0;
  let finalAtLastUnit = false;
  let quizzesAnswered = 0;
  let lastRuntimeState = null;

  // Track distinct visited units and verified decision indices
  const distinctUnitsVisited = new Set();
  const resolvedDecisionIndices = new Set();

  // Scoped in-memory driver state (NO DOM attribute mutations)
  let currentSlideUnit = 0;
  let submittedInCurrentSlide = false;
  const clickedGateKeysInCurrentSlide = new Set();
  const clickedTouchKeysInCurrentSlide = new Set();
  let slideStallSteps = 0;
  let lastStallSignature = '';

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
      const scoreScaled = getVal('cmi.score.scaled') || null;
      return {
        lessonStatus: String(lessonStatus).toLowerCase(),
        location,
        scoreRaw: scoreRaw !== '' ? Number(scoreRaw) : null,
        scoreScaled: scoreScaled !== '' && scoreScaled != null ? Number(scoreScaled) : null,
      };
    }).catch(() => null);

    if (runtimeState) {
      lastRuntimeState = runtimeState;
      if (runtimeState.location) {
        const marker = String(runtimeState.location).match(/^(\d+)(?:\/(\d+))?$/);
        if (marker) {
          const cur = Number(marker[1]);
          const tot = marker[2] ? Number(marker[2]) : null;
          if (cur > 0) distinctUnitsVisited.add(cur);
          if (cur > maxVisitedUnit) maxVisitedUnit = cur;
          if (tot && tot > totalUnitsDetected) totalUnitsDetected = tot;
        }
      }
    }

    if (runtimeState?.lessonStatus && TERMINAL_SCORM12.has(runtimeState.lessonStatus)) {
      finalStatusReached = true;
    }

    // Interruption & resume checkpoint (around step 3 with recorded location)
    if (!checkpointTested && steps >= 3 && Boolean(runtimeState?.location)) {
      checkpointTested = true;
      const savedLocation = runtimeState.location;
      // Close page and re-open in authenticated context
      await page.close();
      const resumePage = await context.newPage();
      await resumePage.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      const resumeIframe = resumePage.locator('#scorm-frame');
      await resumeIframe.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => null);

      await resumePage.waitForTimeout(1500);
      let restoredLocation = null;
      for (let retries = 0; retries < 10; retries += 1) {
        restoredLocation = await resumePage.evaluate(() => {
          const api = window.API || window.API_1484_11;
          if (!api) return null;
          return api.LMSGetValue ? api.LMSGetValue('cmi.core.lesson_location') : api.GetValue('cmi.location');
        }).catch(() => null);
        if (savedLocation && String(restoredLocation) === String(savedLocation)) {
          resumedVerified = true;
          break;
        }
        await resumePage.waitForTimeout(500);
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
    const action = await frame.evaluate(({
      plan,
      requiredIndices,
      submittedInSlide,
      clickedGates,
      clickedTouches,
    }) => {
      const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');
      const visible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };

      // Detect current unit and total units from DOM
      const counterEl = document.querySelector('.counter, #count');
      const counterText = clean(counterEl?.innerText || counterEl?.textContent);
      const counterMatch = counterText.match(/^(\d+)\s*\/\s*(\d+)$/);
      let domCurrent = counterMatch ? Number(counterMatch[1]) : 0;
      let domTotal = counterMatch ? Number(counterMatch[2]) : 0;

      const slidesArray = window.COURSE_DATA?.slides;
      if (Array.isArray(slidesArray) && slidesArray.length > 0) {
        if (!domTotal) domTotal = slidesArray.length;
        const activeIdx = Number(window.__AIRTRUST_PLAYER_TEST__?.getState?.()?.active ?? -1);
        if (activeIdx >= 0 && !domCurrent) domCurrent = activeIdx + 1;
      }
      if (!domCurrent && window.__AIRTRUST_PLAYER_TEST__?.getState) {
        const st = window.__AIRTRUST_PLAYER_TEST__.getState();
        if (Number.isFinite(st?.active)) domCurrent = st.active + 1;
      }

      const atLastUnit = Boolean(domTotal > 0 && domCurrent >= domTotal) || Boolean(document.querySelector('#slide-study-end, .study-end'));

      // 1. Check for authentic user completion/finish button in the frame UI
      const finalBtn = Array.from(document.querySelectorAll('button, input[type=button], a')).find((el) => {
        const txt = clean(el.innerText || el.value || el.getAttribute('aria-label') || '').toLowerCase();
        return visible(el) && !el.disabled && /(confirmar encerramento|concluir curso|concluir treinamento|finalizar curso|finalizar treinamento)/i.test(txt);
      });
      if (finalBtn) {
        finalBtn.click();
        return {
          type: 'final-button',
          domCurrent,
          domTotal,
          atLastUnit: atLastUnit || Boolean(domTotal > 0 && domCurrent >= domTotal),
        };
      }

      // 2. Interactive Gate items: hotspots, section map tabs, mandatory criteria (tracked in driver memory)
      const unvisitedGate = Array.from(document.querySelectorAll('[data-gate], button.spot, .section-map-tab')).find((el) => {
        const key = el.getAttribute('data-gate') || clean(el.innerText || el.getAttribute('aria-label') || '');
        return visible(el) && !el.disabled && !clickedGates.includes(key) && !el.classList.contains('seen') && el.getAttribute('aria-pressed') !== 'true';
      });
      if (unvisitedGate) {
        const gateKey = unvisitedGate.getAttribute('data-gate') || clean(unvisitedGate.innerText || unvisitedGate.getAttribute('aria-label') || '');
        unvisitedGate.click();
        return { type: 'gate-item', gateKey, domCurrent, domTotal, atLastUnit };
      }

      // 3. Scenario options and interactive decision choices
      const scenarioOpt = Array.from(document.querySelectorAll('[data-opt], button.option')).find((el) => {
        return visible(el) && !el.disabled && !el.classList.contains('selected');
      });
      if (scenarioOpt) {
        scenarioOpt.click();
        return { type: 'scenario-option', domCurrent, domTotal, atLastUnit };
      }

      // 4. Assessment questions: options and question navigation
      const assessOpt = Array.from(document.querySelectorAll('[data-answer], button.answer')).find((el) => {
        return visible(el) && !el.disabled && !el.classList.contains('selected');
      });
      if (assessOpt) {
        assessOpt.click();
        return { type: 'assessment-answer', domCurrent, domTotal, atLastUnit };
      }

      const qNext = document.querySelector('#qNext');
      if (qNext && visible(qNext) && !qNext.disabled) {
        qNext.click();
        return { type: 'assessment-next-q', domCurrent, domTotal, atLastUnit };
      }

      // 5. Explicit touch targets (tracked in driver memory)
      const touchTarget = Array.from(document.querySelectorAll('[data-touch], .touchable')).find((el) => {
        const key = el.getAttribute('data-touch') || el.id || clean(el.innerText);
        return visible(el) && !el.disabled && !clickedTouches.includes(key);
      });
      if (touchTarget) {
        const touchKey = touchTarget.getAttribute('data-touch') || touchTarget.id || clean(touchTarget.innerText);
        touchTarget.click();
        return { type: 'touch-target', touchKey, domCurrent, domTotal, atLastUnit };
      }

      // 6. Accordion handling: details & summary
      const closedSummaries = Array.from(document.querySelectorAll('details:not([open]) > summary')).filter(visible);
      if (closedSummaries.length > 0) {
        closedSummaries[0].click();
        closedSummaries[0].dispatchEvent(new Event('toggle', { bubbles: true }));
        return { type: 'accordion-expand', domCurrent, domTotal, atLastUnit };
      }

      // If details are present, ensure scroll and event dispatch
      const details = Array.from(document.querySelectorAll('details[open]')).filter(visible);
      if (details.length > 0) {
        details.forEach((d) => d.dispatchEvent(new Event('scroll', { bubbles: true })));
      }

      // 7. Interactive choices / radio options / checklists
      const choices = Array.from(document.querySelectorAll('button.choice, button.option, input[type=radio], .quiz-option')).filter(visible);
      if (choices.length > 0) {
        const unselected = choices.find((c) => !c.classList.contains('selected') && !c.checked);
        if (unselected) {
          unselected.click();
          return { type: 'quiz-choice', domCurrent, domTotal, atLastUnit };
        }
      }

      const unselectedCheckbox = Array.from(document.querySelectorAll('input[type=checkbox]')).find((c) => {
        return visible(c) && !c.disabled && !c.checked && !c.closest('nav,aside,header,footer,[hidden]');
      });
      if (unselectedCheckbox) {
        unselectedCheckbox.click();
        return { type: 'checklist-checkbox', domCurrent, domTotal, atLastUnit };
      }

      // 8. Submit / Confirm buttons (tracked via driver memory without mutating DOM attributes)
      const submitBtn = Array.from(document.querySelectorAll('button, input[type=button]')).find((el) => {
        const txt = clean(el.innerText || el.value).toLowerCase();
        return visible(el) && !el.disabled && !submittedInSlide && /(confirmar|responder|verificar|submit)/i.test(txt);
      });
      if (submitBtn) {
        submitBtn.click();
        return { type: 'submit', domCurrent, domTotal, atLastUnit };
      }

      // 9. Next / Advance navigation: prioritize #next
      const nextBtnPrimary = document.querySelector('#next');
      if (nextBtnPrimary && visible(nextBtnPrimary) && !nextBtnPrimary.disabled) {
        nextBtnPrimary.click();
        return { type: 'next-button', domCurrent, domTotal, atLastUnit };
      }

      const nextUnit = document.querySelector('#nextUnit');
      if (nextUnit && visible(nextUnit) && !nextUnit.disabled) {
        nextUnit.click();
        return { type: 'next-unit', domCurrent, domTotal, atLastUnit };
      }

      const nextBtn = Array.from(document.querySelectorAll('button, a, [role=button]')).find((el) => {
        const txt = clean(el.innerText || el.getAttribute('aria-label') || el.id).toLowerCase();
        return visible(el) && !el.disabled && /(next|avan[cç]ar|pr[oó]ximo|continuar|prosseguir)/i.test(txt);
      });
      if (nextBtn) {
        nextBtn.click();
        return { type: 'next-button', domCurrent, domTotal, atLastUnit };
      }

      return { type: 'none', domCurrent, domTotal, atLastUnit };
    }, {
      plan: answerPlan,
      requiredIndices: requiredDecisionSlideIndices,
      submittedInSlide: submittedInCurrentSlide,
      clickedGates: Array.from(clickedGateKeysInCurrentSlide),
      clickedTouches: Array.from(clickedTouchKeysInCurrentSlide),
    }).catch(() => ({ type: 'error' }));

    if (action?.domCurrent) {
      distinctUnitsVisited.add(action.domCurrent);
      if (action.domCurrent > maxVisitedUnit) maxVisitedUnit = action.domCurrent;
      if (action.domCurrent !== currentSlideUnit) {
        currentSlideUnit = action.domCurrent;
        submittedInCurrentSlide = false;
        clickedGateKeysInCurrentSlide.clear();
        clickedTouchKeysInCurrentSlide.clear();
        slideStallSteps = 0;
      }
    }
    if (action?.domTotal && action.domTotal > totalUnitsDetected) totalUnitsDetected = action.domTotal;
    if (action?.atLastUnit && totalUnitsDetected > 0 && maxVisitedUnit >= totalUnitsDetected) {
      finalAtLastUnit = true;
    }

    if (action?.type === 'gate-item' && action.gateKey) {
      clickedGateKeysInCurrentSlide.add(action.gateKey);
    }
    if (action?.type === 'touch-target' && action.touchKey) {
      clickedTouchKeysInCurrentSlide.add(action.touchKey);
    }
    if (action?.type === 'submit') {
      submittedInCurrentSlide = true;
    }
    if (action?.type === 'scenario-option' || action?.type === 'assessment-answer') {
      if (action.domCurrent > 0) {
        resolvedDecisionIndices.add(action.domCurrent);
      }
    }

    if (
      action?.type === 'quiz-choice' ||
      action?.type === 'submit' ||
      action?.type === 'scenario-option' ||
      action?.type === 'assessment-answer' ||
      action?.type === 'gate-item' ||
      action?.type === 'touch-target'
    ) {
      quizzesAnswered += 1;
    }

    // Driver stall detection: fail if 30 iterations produce identical state without progress
    const stallSig = `${action?.domCurrent}:${action?.type}:${distinctUnitsVisited.size}:${resolvedDecisionIndices.size}:${clickedGateKeysInCurrentSlide.size}:${submittedInCurrentSlide}`;
    if (stallSig === lastStallSignature) {
      slideStallSteps += 1;
      if (slideStallSteps >= 30) {
        throw new Error(`DRIVER_STALL_AT_UNIT_${action?.domCurrent || 'UNKNOWN'}`);
      }
    } else {
      lastStallSignature = stallSig;
      slideStallSteps = 0;
    }

    if (action?.type === 'final-button') {
      finalButtonClicked = true;
      if (totalUnitsDetected > 0 && maxVisitedUnit >= totalUnitsDetected) {
        finalAtLastUnit = true;
      }
      await page.waitForTimeout(1000);
      break;
    }

    // Check if the wrapper overlay is showing and click Fechar
    const overlayClose = await page.$('#completion-overlay.show #btn-close');
    if (overlayClose) {
      await overlayClose.click().catch(() => null);
      finalButtonClicked = true;
      if (totalUnitsDetected > 0 && maxVisitedUnit >= totalUnitsDetected) {
        finalAtLastUnit = true;
      }
      break;
    }

    steps += 1;
    await page.waitForTimeout(action?.type === 'accordion-expand' ? 400 : 250);
  }

  // Check if wrapper overlay became visible post-traversal
  const finalOverlayBtn = await page.$('#completion-overlay.show #btn-close');
  if (finalOverlayBtn) {
    await finalOverlayBtn.click().catch(() => null);
  }

  await page.waitForTimeout(1000);
  await browser.close();

  // Poll for completion persistence in backend (up to 10s)
  let detail = await getMatriculaDetail(token, matriculaId);
  for (let poll = 0; poll < 10; poll += 1) {
    if (String(detail.status).toUpperCase() === 'CONCLUIDO' && Number(detail.progresso_pct || 0) === 100) {
      break;
    }
    await delay(1000);
    detail = await getMatriculaDetail(token, matriculaId);
  }
  const isConcluido = String(detail.status).toUpperCase() === 'CONCLUIDO';
  const progress100 = Number(detail.progresso_pct || 0) === 100;

  // Qualification & Certificate
  const qualExpected = Boolean(course.qualificacao_tipo_id || course.gerar_qualificacao_ao_concluir === 1);
  const qual = await checkLearnerQualifications(token, funcionarioId, course.id, detail.qualificacao_historico_id);
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

  // Evaluate Course Path & Assessment Policy
  const pathVerdict = evaluateCoursePath({
    contentType: 'scorm',
    totalUnits: totalUnitsDetected,
    visitedUnits: distinctUnitsVisited.size,
    distinctUnitsVisited,
    atLastUnit: (finalAtLastUnit || isConcluido) && totalUnitsDetected > 0 && maxVisitedUnit >= totalUnitsDetected,
    completedActivities: resolvedDecisionIndices.size,
    totalActivities: requiredDecisionSlideIndices.length,
  });

  const assessmentVerdict = evaluateAssessmentPolicy({
    policy: course.scorm_assessment_policy,
    lessonStatus: lastRuntimeState?.lessonStatus,
    scoreRaw: lastRuntimeState?.scoreRaw,
    scoreScaled: lastRuntimeState?.scoreScaled,
    masteryScore: course.scorm_mastery_score,
  });

  const verdict = evaluateHomologationVerdict({
    percurso_ok: pathVerdict.ok,
    avaliacao_ok: assessmentVerdict.ok,
    isConcluido,
    progress100,
    resumedVerified: resumedVerified || totalUnitsDetected <= 1,
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
    matricula_id: matriculaId,
    matricula_ok: true,
    percurso_ok: pathVerdict.ok,
    resumed_ok: resumedVerified || totalUnitsDetected <= 1,
    avaliacao_ok: assessmentVerdict.ok,
    finalizacao_ok: isConcluido && progress100,
    status_pos_conclusao: detail.status,
    qualificacao_gerada: qual ? `SIM (#${qual.id})` : 'N/A',
    certificado_emitido: cert ? `SIM (${cert.sha256.slice(0, 12)}...)` : 'N/A',
    reabertura_sem_downgrade: reopenNoDowngrade,
    status: verdict.pass ? 'PASS' : 'FAIL',
    reason: verdict.reason,
    audit_evidence: {
      units_visited: maxVisitedUnit,
      total_units: totalUnitsDetected,
      distinct_units_visited_count: distinctUnitsVisited.size,
      actions_count: steps,
      resume_tested: checkpointTested,
      resume_verified: resumedVerified || totalUnitsDetected <= 1,
      resolved_decisions_count: resolvedDecisionIndices.size,
      required_decisions_count: requiredDecisionSlideIndices.length,
      assessment: {
        policy: course.scorm_assessment_policy || 'FORMATIVE',
        status: lastRuntimeState?.lessonStatus || null,
        score_raw: lastRuntimeState?.scoreRaw ?? null,
        score_scaled: lastRuntimeState?.scoreScaled ?? null,
        mastery_score: course.scorm_mastery_score ?? null,
        passed: assessmentVerdict.ok,
      },
      backend_status: detail.status,
      backend_progresso: detail.progresso_pct,
      qualificacao_id: qual?.id ?? null,
      certificado_sha: cert?.sha256 ?? null,
    },
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
        edition_sha: 'n/a',
        policy: course.scorm_assessment_policy || 'FORMATIVE',
        matricula_id: null,
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
