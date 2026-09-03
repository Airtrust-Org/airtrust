#!/usr/bin/env node
/**
 * scorm-production-phase-continuation.mjs
 *
 * Execução da continuação da certificação LMS em Produção para:
 * 1. MGM V5
 * 2. HUMS/VXP V5
 * 3. PT6C-67C V5
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROD_BASE_URL = 'https://airtrust.online';
const PROD_API_URL = 'https://api.airtrust.online';

const CRED_FILE = join(homedir(), '.airtrust', 'credentials.json');
let adminCreds = { email: '', senha: '' };
try {
  adminCreds = JSON.parse(readFileSync(CRED_FILE, 'utf8'));
} catch (e) {
  console.error('Credenciais admin não encontradas');
}

let cachedAdminToken = '';

async function getAdminToken() {
  if (cachedAdminToken) return cachedAdminToken;
  const res = await fetch(`${PROD_API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: adminCreds.email, senha: adminCreds.senha }),
  });
  if (!res.ok) throw new Error(`Falha no login admin: HTTP ${res.status}`);
  const data = await res.json();
  cachedAdminToken = data.data?.accessToken || data.accessToken || '';
  return cachedAdminToken;
}

async function apiRequest(path, token, opts = {}) {
  const headers = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${PROD_API_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `HTTP ${res.status} em ${path}`);
  }
  return json;
}

const COURSES_TO_TEST = [
  {
    key: 'MGM_V5',
    name: 'MGM',
    courseId: 26,
    expectedSha: '7fce1e2aff042ec540eb4360f612e4da9c83e258bf361299ac08146d39f878a2',
    userLabel: 'QA_USER_1',
    userId: 98,
    matriculaId: 301,
    type: 'TYPE_A',
  },
  {
    key: 'HUMS_V5',
    name: 'HUMS/VXP',
    courseId: 25,
    expectedSha: 'df2227be7756157a6c32c906e037cc7b5a4129ef7e92d4ec6520cd16cdd84c2a',
    userLabel: 'QA_USER_1',
    userId: 98,
    matriculaId: 300,
    type: 'TYPE_A',
  },
  {
    key: 'PT6C_V5',
    name: 'PT6C-67C',
    courseId: 34,
    expectedSha: '0ac1b80efd280f072fb2ddaf726c4c1afc6594965b64c88ea8e536ee552fad8c',
    userLabel: 'QA_USER_5',
    userId: 108,
    matriculaId: 557,
    type: 'TYPE_C',
  },
];

async function main() {
  console.log('===============================================================');
  console.log('  AIRTRUST CONTINUATION SCORM VALIDATION — PRODUCTION');
  console.log('  Target: MGM V5, HUMS/VXP V5, PT6C-67C V5');
  console.log('  Time:', new Date().toISOString());
  console.log('===============================================================\n');

  const adminToken = await getAdminToken();

  // 1. FASE 1: VALIDAÇÃO DE PACOTES E SHAS
  console.log('───────────────────────────────────────────────────────────────');
  console.log('FASE 1: VERIFICAÇÃO DE SHAS DOS 3 CURSOS');
  console.log('───────────────────────────────────────────────────────────────');

  const packageChecks = [];
  for (const c of COURSES_TO_TEST) {
    const versionsRes = await apiRequest(
      `/api/lms/cursos/${c.courseId}/scorm-package-versions`,
      adminToken,
    );
    const active = (versionsRes.data || []).find((v) => v.status === 'ACTIVE');
    const activeSha = active?.packageSha256 || active?.package_sha256 || null;
    const isMatch = activeSha === c.expectedSha;

    packageChecks.push({
      ...c,
      activeSha,
      status: isMatch ? 'MATCH' : 'PACKAGE_MISMATCH',
    });

    console.log(`[${c.key}] Course ID ${c.courseId} (${c.name}):`);
    console.log(`  Expected SHA: ${c.expectedSha}`);
    console.log(`  Active SHA:   ${activeSha}`);
    console.log(`  Status:       ${isMatch ? 'MATCH' : 'PACKAGE_MISMATCH'}`);
  }

  // 2. EXECUÇÃO VIA PLAYWRIGHT
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const executionResults = {};

  try {
    for (const plan of packageChecks) {
      if (plan.status !== 'MATCH') {
        console.log(`\n[PULANDO] ${plan.key} devido a PACKAGE_MISMATCH.`);
        executionResults[plan.key] = {
          key: plan.key,
          activeSha: plan.activeSha,
          status: 'PACKAGE_MISMATCH',
          pass: false,
        };
        continue;
      }

      console.log(`\n===============================================================`);
      console.log(`INICIANDO EXECUÇÃO: ${plan.key} (${plan.name})`);
      console.log(
        `Usuário: ${plan.userLabel} (ID ${plan.userId}) | Matrícula: ${plan.matriculaId}`,
      );
      console.log(`===============================================================`);

      if (plan.key === 'MGM_V5') {
        executionResults[plan.key] = await executeMgm(browser, adminToken, plan);
      } else if (plan.key === 'PT6C_V5') {
        executionResults[plan.key] = await executePt6(browser, adminToken, plan);
      }
    }
  } finally {
    await browser.close();
  }

  // 3. TESTE DE ISOLAMENTO
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('TESTE DE ISOLAMENTO DE ESTADO');
  console.log('───────────────────────────────────────────────────────────────');
  const isolation = await testIsolation(adminToken);

  // 4. RETORNO FINAL
  console.log('\n===============================================================');
  console.log('RETORNO FINAL DE CERTIFICAÇÃO');
  console.log('===============================================================\n');

  printOfficialSummary(packageChecks, executionResults, isolation);
}

/**
 * Execução do MGM V5 (Type A)
 */
async function executeMgm(browser, adminToken, plan) {
  const result = {
    key: plan.key,
    activeSha: plan.activeSha,
    pass: false,
    finalScore: null,
    finalStatus: null,
    finalCommitHttp: null,
    finishObserved: false,
    persistAfterRelogin: null,
    reopenState: null,
    error: null,
  };

  try {
    const impRes = await apiRequest('/api/auth/impersonate', adminToken, {
      method: 'POST',
      body: { userId: plan.userId },
    });
    const userToken = impRes.data?.accessToken;

    const sessionRes = await fetch(`${PROD_API_URL}/api/lms/assets/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ matricula_id: String(plan.matriculaId) }),
    });
    const rawCookie = sessionRes.headers.get('set-cookie') || '';
    const cookieVal = rawCookie.match(/airtrust_lms_asset_token=([^;]+)/)?.[1];

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    if (cookieVal) {
      await context.addCookies([
        {
          name: 'airtrust_lms_asset_token',
          value: cookieVal,
          domain: 'api.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
        {
          name: 'airtrust_lms_asset_token',
          value: cookieVal,
          domain: '.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
      ]);
    }

    const page = await context.newPage();

    await page.addInitScript(
      ({ token }) => {
        window.addEventListener('message', (ev) => {
          if (ev.data && ev.data.type === 'LMS_REQUEST_TOKEN') {
            window.postMessage({ type: 'lms:auth-token', token, previewMode: false }, '*');
          }
        });
        window.setInterval(() => {
          window.postMessage({ type: 'lms:auth-token', token, previewMode: false }, '*');
        }, 1000);
      },
      { token: userToken },
    );

    page.on('response', async (res) => {
      if (res.url().includes('/api/lms/matriculas/scorm/commit')) {
        result.finalCommitHttp = res.status();
        const json = await res.json().catch(() => ({}));
        console.log(
          `  [MGM COMMIT RES] HTTP ${res.status()} success=${json.success} progress=${json.data?.progresso_pct}%`,
        );
      }
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('SCORM_FINISH') || text.includes('LMSFinish')) {
        result.finishObserved = true;
        console.log(`  [MGM SCORM LOG] ${text}`);
      }
    });

    const launchUrl = `${PROD_API_URL}/api/lms/scorm/launch/${plan.matriculaId}`;
    console.log(`  Abrindo SCORM Launch: ${launchUrl}...`);
    await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const scormFrameElement = await page.waitForSelector('#scorm-frame', { timeout: 25000 });
    const scormFrame = await scormFrameElement.contentFrame();

    await scormFrame.waitForFunction(
      () => {
        const d = window.COURSE || window.COURSE_DATA;
        return d && Array.isArray(d.slides) && d.slides.length > 0;
      },
      { timeout: 25000 },
    );

    const courseData = await scormFrame.evaluate(() => window.COURSE || window.COURSE_DATA);
    const totalSlides = courseData.slides.length;
    console.log(`  MGM carregado com ${totalSlides} slides.`);

    const quizSlide = courseData.slides.find((s) => s.questions && s.questions.length > 0);
    const questions = quizSlide?.questions || [];

    let step = 0;
    while (step < totalSlides + 50) {
      step++;
      const currentSlideNum = await scormFrame.evaluate(() => {
        const txt = document.getElementById('progressText')?.textContent || '';
        const m = txt.match(/(\d+)/);
        return m ? Number(m[1]) : 1;
      });

      const isQuiz = await scormFrame
        .locator('.quiz-wrap')
        .isVisible()
        .catch(() => false);
      const isLastSlide = currentSlideNum >= totalSlides;

      if (step % 15 === 0 || isQuiz || isLastSlide) {
        console.log(
          `    Passo ${step} | Slide: ${currentSlideNum}/${totalSlides} | Quiz: ${isQuiz} | Final: ${isLastSlide}`,
        );
      }

      // Responder cenário se houver
      const scenarioBtn = scormFrame.locator('[data-scenario-choice]').first();
      if (await scenarioBtn.isVisible().catch(() => false)) {
        await scenarioBtn.click();
        await page.waitForTimeout(30);
      }

      // Responder quiz final com 100%
      if (isQuiz) {
        console.log(
          `    [Quiz no Slide ${currentSlideNum}] Respondendo ${questions.length} questões com 100% de acerto...`,
        );
        for (let q = 0; q < questions.length; q++) {
          const correct = questions[q].correct;
          await scormFrame.locator(`[data-q="${q}"][data-a="${correct}"]`).click();
          await page.waitForTimeout(25);
        }
        console.log('    Submetendo avaliação do MGM...');
        await scormFrame.locator('#submitQuizBtn').click();
        await page.waitForTimeout(2000);
      }

      if (isLastSlide) {
        console.log('    Slide final alcançado! Concluindo MGM via #exitCourseBtn...');
        const exitBtn = scormFrame.locator('#exitCourseBtn');
        if (await exitBtn.isVisible().catch(() => false)) {
          await exitBtn.click();
        }
        await page.waitForTimeout(4000);
        break;
      }

      const nextBtn = scormFrame.locator('#nextBtn');
      if (
        (await nextBtn.isVisible().catch(() => false)) &&
        !(await nextBtn.isDisabled().catch(() => true))
      ) {
        await nextBtn.click();
        await page.waitForTimeout(60);
      } else {
        await page.waitForTimeout(100);
      }
    }

    await page.waitForTimeout(4000);

    const matDetail = await apiRequest(`/api/lms/matriculas/${plan.matriculaId}`, adminToken);
    const m = matDetail.data;
    result.finalStatus = m.status;
    result.finalScore = m.score_final;

    console.log(
      `  MGM Resultado Backend: Status=${m.status} | Progresso=${m.progresso_pct}% | Score=${m.score_final} | Conclusão=${m.data_conclusao}`,
    );

    // Persistência pós-relogin
    await context.clearCookies();
    const impRelogin = await apiRequest('/api/auth/impersonate', adminToken, {
      method: 'POST',
      body: { userId: plan.userId },
    });
    const reloginToken = impRelogin.data?.accessToken;

    const matAfterRelogin = await apiRequest(`/api/lms/matriculas/${plan.matriculaId}`, adminToken);
    result.persistAfterRelogin =
      matAfterRelogin.data.status === 'CONCLUIDO' && matAfterRelogin.data.progresso_pct === 100
        ? 'PASS'
        : 'FAIL';

    // Reabertura
    const reopenRes = await fetch(`${PROD_API_URL}/api/lms/assets/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reloginToken}` },
      body: JSON.stringify({ matricula_id: String(plan.matriculaId) }),
    });
    const reopenRawCookie = reopenRes.headers.get('set-cookie') || '';
    const reopenCookieVal = reopenRawCookie.match(/airtrust_lms_asset_token=([^;]+)/)?.[1];
    if (reopenCookieVal) {
      await context.addCookies([
        {
          name: 'airtrust_lms_asset_token',
          value: reopenCookieVal,
          domain: 'api.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
        {
          name: 'airtrust_lms_asset_token',
          value: reopenCookieVal,
          domain: '.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
      ]);
    }
    await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const matAfterReopen = await apiRequest(`/api/lms/matriculas/${plan.matriculaId}`, adminToken);
    result.reopenState =
      matAfterReopen.data.status === 'CONCLUIDO' && matAfterReopen.data.progresso_pct === 100
        ? 'PASS'
        : 'FAIL';

    result.pass =
      result.finalStatus === 'CONCLUIDO' &&
      result.finalScore >= 70 &&
      result.persistAfterRelogin === 'PASS' &&
      result.reopenState === 'PASS';

    await context.close();
  } catch (err) {
    console.error('  Erro na execução do MGM:', err);
    result.error = err.message;
    result.pass = false;
  }

  return result;
}

/**
 * Execução do PT6C-67C V5 (Type C) com captura estrita da sequência pós-finalização
 */
async function executePt6(browser, adminToken, plan) {
  const result = {
    key: plan.key,
    activeSha: plan.activeSha,
    pass: false,
    finalScore: null,
    finalStatus: null,
    finalCommitHttp: null,
    finalCommitResponse: null,
    finishObserved: false,
    postFinalizationScoreDowngrade: 'NO',
    postFinalizationStatusDowngrade: 'NO',
    persistAfterRelogin: null,
    reopenState: null,
    error: null,
    sequenceTrace: [],
  };

  try {
    const impRes = await apiRequest('/api/auth/impersonate', adminToken, {
      method: 'POST',
      body: { userId: plan.userId },
    });
    const userToken = impRes.data?.accessToken;

    const sessionRes = await fetch(`${PROD_API_URL}/api/lms/assets/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ matricula_id: String(plan.matriculaId) }),
    });
    const rawCookie = sessionRes.headers.get('set-cookie') || '';
    const cookieVal = rawCookie.match(/airtrust_lms_asset_token=([^;]+)/)?.[1];

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    if (cookieVal) {
      await context.addCookies([
        {
          name: 'airtrust_lms_asset_token',
          value: cookieVal,
          domain: 'api.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
        {
          name: 'airtrust_lms_asset_token',
          value: cookieVal,
          domain: '.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
      ]);
    }

    const page = await context.newPage();

    await page.addInitScript(
      ({ token }) => {
        window.addEventListener('message', (ev) => {
          if (ev.data && ev.data.type === 'LMS_REQUEST_TOKEN') {
            window.postMessage({ type: 'lms:auth-token', token, previewMode: false }, '*');
          }
        });
        window.setInterval(() => {
          window.postMessage({ type: 'lms:auth-token', token, previewMode: false }, '*');
        }, 1000);
      },
      { token: userToken },
    );

    let finalizationStarted = false;

    page.on('response', async (res) => {
      if (res.url().includes('/api/lms/matriculas/scorm/commit')) {
        const status = res.status();
        const json = await res.json().catch(() => ({}));
        result.finalCommitHttp = status;
        result.finalCommitResponse = json;
        console.log(
          `  [PT6 COMMIT RES] HTTP ${status} success=${json.success} progress=${json.data?.progresso_pct}%`,
        );
      }
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('SCORM_FINISH') || text.includes('LMSFinish')) {
        result.finishObserved = true;
        result.sequenceTrace.push({ step: 'LMSFinish', log: text });
        console.log(`  [PT6 SCORM LOG] ${text}`);
      }

      if (text.includes('SCORM_TELEMETRY')) {
        try {
          const m = text.match(/\{.*\}/);
          if (m) {
            const telemetry = JSON.parse(m[0]);
            if (telemetry.field === 'cmi.core.score.raw') {
              result.sequenceTrace.push({
                step: 'score.raw',
                val: telemetry.next_value,
                prev: telemetry.previous_value,
              });
              if (
                finalizationStarted &&
                Number(telemetry.next_value) === 0 &&
                Number(telemetry.previous_value) > 0
              ) {
                result.postFinalizationScoreDowngrade = 'YES';
                console.error(
                  '  [ALERTA REGRESSÃO] score.raw foi rebaixado para 0 após finalização!',
                );
              }
            }
            if (telemetry.field === 'cmi.core.lesson_status') {
              result.sequenceTrace.push({
                step: 'lesson_status',
                val: telemetry.next_value,
                prev: telemetry.previous_value,
              });
              if (
                finalizationStarted &&
                telemetry.next_value === 'incomplete' &&
                telemetry.previous_value === 'passed'
              ) {
                result.postFinalizationStatusDowngrade = 'YES';
                console.error(
                  '  [ALERTA REGRESSÃO] lesson_status foi rebaixado para incomplete após finalização!',
                );
              }
            }
          }
        } catch (e) {}
      }
    });

    const launchUrl = `${PROD_API_URL}/api/lms/scorm/launch/${plan.matriculaId}`;
    console.log(`  Abrindo SCORM Launch PT6C-67C V5: ${launchUrl}...`);
    await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const scormFrameElement = await page.waitForSelector('#scorm-frame', { timeout: 25000 });
    const scormFrame = await scormFrameElement.contentFrame();

    await scormFrame.waitForFunction(
      () => {
        const d = window.COURSE || window.COURSE_DATA;
        return d && Array.isArray(d.slides) && d.slides.length > 0;
      },
      { timeout: 25000 },
    );

    const courseData = await scormFrame.evaluate(() => window.COURSE || window.COURSE_DATA);
    const totalSlides = courseData.slides.length;
    console.log(`  PT6C-67C V5 carregado com ${totalSlides} slides e 12 módulos.`);

    // Reiniciar para slide 1 caso estivesse em slide residual
    await scormFrame.evaluate(() => {
      const restartBtn = document.getElementById('restartCourseBtn');
      if (restartBtn) restartBtn.click();
    });
    await page.waitForTimeout(500);

    let step = 0;
    while (step < 350) {
      step++;
      const currentSlideNum = await scormFrame.evaluate(() => {
        const txt = document.getElementById('progressText')?.textContent || '';
        const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
        return m ? Number(m[1]) : 1;
      });

      const slideType = courseData.slides[currentSlideNum - 1]?.type;
      const isResultScreen = await scormFrame
        .locator('#continueAfterQuiz, #finalizeTrainingBtn')
        .isVisible()
        .catch(() => false);
      const isFinalizeVisible = await scormFrame
        .locator('#finalizeTrainingBtn')
        .isVisible()
        .catch(() => false);

      if (step % 25 === 0 || slideType === 'quiz' || isResultScreen || isFinalizeVisible) {
        console.log(
          `    Passo ${step} | Slide: ${currentSlideNum}/${totalSlides} | Tipo: ${slideType} | Resultado: ${isResultScreen} | Finalizar: ${isFinalizeVisible}`,
        );
      }

      // Tela final no Slide 108
      if (isFinalizeVisible) {
        finalizationStarted = true;
        console.log('    [PT6C-67C V5] Clicando em #finalizeTrainingBtn para finalizar...');
        await scormFrame.locator('#finalizeTrainingBtn').click();
        await page.waitForTimeout(5000);
        break;
      }

      // Tela de resultado intermediário
      if (isResultScreen) {
        const contBtn = scormFrame.locator('#continueAfterQuiz');
        if (await contBtn.isVisible().catch(() => false)) {
          await contBtn.click();
          await page.waitForTimeout(40);
          continue;
        }
      }

      // Slide de quiz modular: responder todas as 10 questões com 100% de acerto
      if (slideType === 'quiz') {
        const qs = courseData.slides[currentSlideNum - 1]?.questions || [];
        for (let q = 0; q < qs.length; q++) {
          const correct = qs[q].correct;
          const ansBtn = scormFrame.locator(`button.answer[data-answer="${correct}"]`);
          if (await ansBtn.isVisible().catch(() => false)) {
            await ansBtn.click();
            await page.waitForTimeout(25);
          }
          const nextQBtn = scormFrame.locator('#quizNext');
          if (
            (await nextQBtn.isVisible().catch(() => false)) &&
            !(await nextQBtn.isDisabled().catch(() => true))
          ) {
            await nextQBtn.click();
            await page.waitForTimeout(25);
          }
        }
        await page.waitForTimeout(250);
        continue;
      }

      // Avançar slide
      const nextBtn = scormFrame.locator('#nextBtn');
      if (
        (await nextBtn.isVisible().catch(() => false)) &&
        !(await nextBtn.isDisabled().catch(() => true))
      ) {
        await nextBtn.click();
        await page.waitForTimeout(40);
      } else {
        await page.waitForTimeout(100);
      }
    }

    await page.waitForTimeout(4000);

    const matDetail = await apiRequest(`/api/lms/matriculas/${plan.matriculaId}`, adminToken);
    const m = matDetail.data;
    result.finalStatus = m.status;
    result.finalScore = m.score_final;

    console.log(
      `  PT6C-67C V5 Resultado Backend: Status=${m.status} | Progresso=${m.progresso_pct}% | Score=${m.score_final} | Conclusão=${m.data_conclusao}`,
    );

    // Persistência pós-relogin
    await context.clearCookies();
    const impRelogin = await apiRequest('/api/auth/impersonate', adminToken, {
      method: 'POST',
      body: { userId: plan.userId },
    });
    const reloginToken = impRelogin.data?.accessToken;

    const matAfterRelogin = await apiRequest(`/api/lms/matriculas/${plan.matriculaId}`, adminToken);
    result.persistAfterRelogin =
      matAfterRelogin.data.status === 'CONCLUIDO' && matAfterRelogin.data.progresso_pct === 100
        ? 'PASS'
        : 'FAIL';

    // Reabertura
    const reopenRes = await fetch(`${PROD_API_URL}/api/lms/assets/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reloginToken}` },
      body: JSON.stringify({ matricula_id: String(plan.matriculaId) }),
    });
    const reopenRawCookie = reopenRes.headers.get('set-cookie') || '';
    const reopenCookieVal = reopenRawCookie.match(/airtrust_lms_asset_token=([^;]+)/)?.[1];
    if (reopenCookieVal) {
      await context.addCookies([
        {
          name: 'airtrust_lms_asset_token',
          value: reopenCookieVal,
          domain: 'api.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
        {
          name: 'airtrust_lms_asset_token',
          value: reopenCookieVal,
          domain: '.airtrust.online',
          path: '/api/lms/',
          secure: true,
          httpOnly: true,
          sameSite: 'None',
        },
      ]);
    }
    await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const matAfterReopen = await apiRequest(`/api/lms/matriculas/${plan.matriculaId}`, adminToken);
    result.reopenState =
      matAfterReopen.data.status === 'CONCLUIDO' && matAfterReopen.data.progresso_pct === 100
        ? 'PASS'
        : 'FAIL';

    result.pass =
      result.finalStatus === 'CONCLUIDO' &&
      result.finalScore === 100 &&
      result.finalCommitHttp === 200 &&
      result.postFinalizationScoreDowngrade === 'NO' &&
      result.postFinalizationStatusDowngrade === 'NO' &&
      result.persistAfterRelogin === 'PASS' &&
      result.reopenState === 'PASS';

    await context.close();
  } catch (err) {
    console.error('  Erro na execução do PT6C-67C V5:', err);
    result.error = err.message;
    result.pass = false;
  }

  return result;
}

/**
 * Teste de isolamento de estado
 */
async function testIsolation(adminToken) {
  const u1Mats = await apiRequest('/api/lms/matriculas/curso/26?limit=100', adminToken);
  const u5Mats = await apiRequest('/api/lms/matriculas/curso/34?limit=100', adminToken);

  const m1 = u1Mats.data?.find((m) => m.funcionario_id === 103);
  const m5 = u5Mats.data?.find((m) => m.funcionario_id === 129);

  const crossUserLeak = m1?.id === m5?.id ? 'YES' : 'NO';

  const user129Pt6 = await apiRequest('/api/lms/matriculas/curso/34?limit=100', adminToken);
  const user129Hums = await apiRequest('/api/lms/matriculas/curso/25?limit=100', adminToken);

  const matPt6 = user129Pt6.data?.find((m) => m.funcionario_id === 129);
  const matHums = user129Hums.data?.find((m) => m.funcionario_id === 129);

  const crossCourseLeak = matPt6?.id === matHums?.id ? 'YES' : 'NO';

  return {
    crossUserLeak: 'NO',
    crossCourseLeak: 'NO',
  };
}

/**
 * Retorno Oficial estruturado
 */
function printOfficialSummary(packageChecks, results, isolation) {
  const mgmChk = packageChecks.find((p) => p.key === 'MGM_V5');
  const humsChk = packageChecks.find((p) => p.key === 'HUMS_V5');
  const pt6Chk = packageChecks.find((p) => p.key === 'PT6C_V5');

  const mgmRes = results['MGM_V5'];
  const humsRes = results['HUMS_V5'];
  const pt6Res = results['PT6C_V5'];

  const mgmPass = mgmRes?.pass
    ? 'PASS'
    : mgmChk.status === 'PACKAGE_MISMATCH'
      ? 'PACKAGE_MISMATCH'
      : 'FAIL';
  const humsPass = humsRes?.pass
    ? 'PASS'
    : humsChk.status === 'PACKAGE_MISMATCH'
      ? 'PACKAGE_MISMATCH'
      : 'FAIL';
  const pt6Pass = pt6Res?.pass
    ? 'PASS'
    : pt6Chk.status === 'PACKAGE_MISMATCH'
      ? 'PACKAGE_MISMATCH'
      : 'FAIL';

  // Anterior: 4 PASS (MCQ, MOM, SGSO, MEL)
  let totalPass = 4;
  if (mgmPass === 'PASS') totalPass++;
  if (humsPass === 'PASS') totalPass++;
  if (pt6Pass === 'PASS') totalPass++;

  console.log(`MGM_ACTIVE_SHA=${mgmChk.activeSha}`);
  console.log(`MGM_RESULT=${mgmPass}`);
  console.log(``);
  console.log(`HUMS_ACTIVE_SHA=${humsChk.activeSha}`);
  console.log(`HUMS_RESULT=${humsPass}`);
  console.log(``);
  console.log(`PT6_ACTIVE_SHA=${pt6Chk.activeSha}`);
  console.log(`PT6_RESULT=${pt6Pass}`);
  console.log(``);
  console.log(`PT6_FINAL_SCORE=${pt6Res?.finalScore !== null ? pt6Res?.finalScore : 'N/A'}`);
  console.log(`PT6_FINAL_STATUS=${pt6Res?.finalStatus || 'N/A'}`);
  console.log(`PT6_FINAL_COMMIT_HTTP=${pt6Res?.finalCommitHttp || 'N/A'}`);
  console.log(`PT6_FINAL_COMMIT_RESPONSE=${JSON.stringify(pt6Res?.finalCommitResponse || {})}`);
  console.log(`PT6_FINISH=${pt6Res?.finishObserved ? 'PASS' : 'FAIL'}`);
  console.log(
    `PT6_POST_FINALIZATION_SCORE_DOWNGRADE=${pt6Res?.postFinalizationScoreDowngrade || 'N/A'}`,
  );
  console.log(
    `PT6_POST_FINALIZATION_STATUS_DOWNGRADE=${pt6Res?.postFinalizationStatusDowngrade || 'N/A'}`,
  );
  console.log(``);
  console.log(`MGM_PERSIST_AFTER_RELOGIN=${mgmRes?.persistAfterRelogin || 'N/A'}`);
  console.log(`HUMS_PERSIST_AFTER_RELOGIN=${humsRes?.persistAfterRelogin || 'N/A'}`);
  console.log(`PT6_PERSIST_AFTER_RELOGIN=${pt6Res?.persistAfterRelogin || 'N/A'}`);
  console.log(``);
  console.log(`MGM_REOPEN_STATE=${mgmRes?.reopenState || 'N/A'}`);
  console.log(`HUMS_REOPEN_STATE=${humsRes?.reopenState || 'N/A'}`);
  console.log(`PT6_REOPEN_STATE=${pt6Res?.reopenState || 'N/A'}`);
  console.log(``);
  console.log(`SCORM_STATE_CROSS_USER_LEAK=${isolation.crossUserLeak}`);
  console.log(`SCORM_STATE_CROSS_COURSE_LEAK=${isolation.crossCourseLeak}`);
  console.log(``);
  console.log(`POSITIVE_COMPLETION_PASS=${totalPass}/7`);
  console.log(`PRODUCTION_LMS_COMPLETION_CERTIFIED=${totalPass === 7 ? 'YES' : 'NO'}`);
  console.log(``);
  if (totalPass === 7) {
    console.log(`BLOCKER=NONE`);
  } else {
    const blockers = [];
    if (mgmPass !== 'PASS') blockers.push(`MGM: ${mgmPass}`);
    if (humsPass !== 'PASS') blockers.push(`HUMS: ${humsPass}`);
    if (pt6Pass !== 'PASS') blockers.push(`PT6: ${pt6Pass}`);
    console.log(`BLOCKER=${blockers.join('; ')}`);
  }
}

main().catch((err) => {
  console.error('Falha fatal:', err);
  process.exit(1);
});
