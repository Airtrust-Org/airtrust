#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium, webkit } from '@playwright/test';
import {
  assert,
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const API = assertAllowedProductionBaseUrl(
  process.env.PROD_API_BASE_URL || 'https://api.airtrust.online',
);
const TARGET_COMPANY_ID = Number(process.env.TARGET_COMPANY_ID || 6);
const EXPECTED_SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
const BROWSER_NAME = String(process.env.CERT_BROWSER || 'chromium').trim().toLowerCase();
const REPORT_PATH = process.env.CERT_REPORT_PATH || `qa-state/lms-active-certification-${BROWSER_NAME}.json`;
const COURSE_TIMEOUT_MS = Number(process.env.CERT_COURSE_TIMEOUT_MS || 25_000);
const MAX_STEPS = Number(process.env.CERT_MAX_STEPS || 240);
const COURSE_IDS = parseCourseIdFilter(process.env.CERT_COURSE_IDS);

const ALLOWED_AUTH_POSTS = new Set(['/api/auth/login', '/api/auth/select-empresa', '/api/lms/assets/session']);
const TERMINAL_SCORM12 = new Set(['passed', 'completed']);
const TERMINAL_SCORM2004_COMPLETION = new Set(['completed']);
const TERMINAL_SCORM2004_SUCCESS = new Set(['passed']);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCourseIdFilter(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Set();
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  invariant(
    parts.length > 0 && parts.every((item) => /^\d+$/.test(item) && Number(item) > 0),
    'CERT_COURSE_IDS_INVALID',
  );
  return new Set(parts.map(Number));
}

function safe(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\b/g, '[email]')
    .slice(0, 500);
}

function isReadOnlyProductRequest(method, route) {
  const verb = String(method || 'GET').toUpperCase();
  const path = new URL(route, API).pathname;
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return true;
  if (verb === 'POST' && ALLOWED_AUTH_POSTS.has(path)) return true;
  return false;
}

async function apiFetch(token, route, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  invariant(isReadOnlyProductRequest(method, route), `WRITE_BLOCKED:${method}:${route}`);
  return fetchJson(`${API}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function assertPinnedProduction() {
  invariant(/^[0-9a-f]{40}$/.test(EXPECTED_SHA), 'EXPECTED_PRODUCTION_SHA_INVALID');
  const response = await fetchJson(`${API}/api/version`);
  invariant(response.status === 200, `PRODUCTION_VERSION_HTTP_${response.status}`);
  const body = response.json?.data && typeof response.json.data === 'object' ? response.json.data : response.json;
  const actual = String(body?.sourceSha || body?.source_sha || '').toLowerCase();
  invariant(actual === EXPECTED_SHA, `PRODUCTION_SHA_MISMATCH:${actual || 'missing'}`);
}

async function productionToken() {
  const email = String(process.env.PROD_SMOKE_EMAIL || process.env.QA_EXAMINER_ADMIN_EMAIL || '').trim();
  const password = String(process.env.PROD_SMOKE_PASSWORD || process.env.QA_EXAMINER_ADMIN_PASSWORD || '');
  invariant(email && password, 'PRODUCTION_SMOKE_CREDENTIALS_MISSING');

  const logged = await login(API, email, password);
  let token = extractAccessToken(logged);
  const empresas = await apiFetch(token, '/api/auth/empresas');
  invariant(empresas.status === 200, `AUTH_EMPRESAS_HTTP_${empresas.status}`);
  const list = Array.isArray(empresas.json?.data?.empresas) ? empresas.json.data.empresas : [];
  invariant(list.some((item) => Number(item?.id || 0) === TARGET_COMPANY_ID), 'TARGET_COMPANY_NOT_AUTHORIZED');
  const current = Number(empresas.json?.data?.empresaAtualId || 0);
  if (current !== TARGET_COMPANY_ID) {
    const selected = await apiFetch(token, '/api/auth/select-empresa', {
      method: 'POST',
      body: { empresaId: TARGET_COMPANY_ID },
    });
    invariant(selected.status === 200, `SELECT_EMPRESA_HTTP_${selected.status}`);
    token = String(selected.json?.data?.accessToken || '');
    invariant(token, 'SELECT_EMPRESA_TOKEN_MISSING');
  }
  const mine = await apiFetch(token, '/api/empresas/minha');
  invariant(mine.status === 200 && Number(mine.json?.data?.id || 0) === TARGET_COMPANY_ID, 'TARGET_COMPANY_CONTEXT_MISMATCH');
  return token;
}

async function listCourses(token) {
  const out = [];
  const limit = 200;
  for (let page = 1; page <= 20; page += 1) {
    const r = await apiFetch(token, `/api/lms/cursos?page=${page}&limit=${limit}`);
    invariant(r.status === 200, `LMS_COURSES_HTTP_${r.status}`);
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

async function courseDetail(token, id) {
  const r = await apiFetch(token, `/api/lms/cursos/${id}`);
  invariant(r.status === 200, `LMS_COURSE_DETAIL_HTTP_${id}_${r.status}`);
  return r.json?.data || {};
}

async function activePackage(token, id) {
  const r = await apiFetch(token, `/api/lms/cursos/${id}/scorm-package-versions`);
  if (r.status === 404) return null;
  invariant(r.status === 200, `LMS_PACKAGE_VERSIONS_HTTP_${id}_${r.status}`);
  const rows = Array.isArray(r.json?.data) ? r.json.data : [];
  const active = rows.filter((row) => String(row?.status || '').toUpperCase() === 'ACTIVE');
  invariant(active.length <= 1, `LMS_MULTIPLE_ACTIVE_SCORM_PACKAGES:${id}`);
  if (!active.length) return null;
  const row = active[0];
  const sha = String(row?.packageSha256 || '').toLowerCase();
  invariant(/^[0-9a-f]{64}$/.test(sha), `LMS_ACTIVE_PACKAGE_SHA_INVALID:${id}`);
  return {
    internalId: String(row?.packageId || ''),
    sha256: sha,
    launchFile: row?.launchFile ? String(row.launchFile) : null,
    validatorVersion: row?.validatorVersion ? String(row.validatorVersion) : null,
    publishable: row?.publishable === true,
    storedRuntimeStatus: row?.runtime?.status ? String(row.runtime.status) : null,
    storedCompletionReached: row?.runtime?.completionReached === true,
    storedLessonStatus: row?.runtime?.lessonStatus ? String(row.runtime.lessonStatus) : null,
  };
}

function parseCompletionManifest(text) {
  try {
    const parsed = JSON.parse(text);
    const rawSlides = parsed?.content?.requiredSlides;
    const rawInteractions = parsed?.assessment?.requiredInteractions;
    const slides = Array.isArray(rawSlides) ? rawSlides.map(String) : [];
    const interactions = Array.isArray(rawInteractions) ? rawInteractions.map(String) : [];
    const slidesValid = Array.isArray(rawSlides) && rawSlides.length > 0 && rawSlides.every((item) => typeof item === 'string' && item.trim());
    const interactionsValid = Array.isArray(rawInteractions) && rawInteractions.every((item) => typeof item === 'string' && item.trim());
    const mastery = Number(parsed?.assessment?.masteryScore);
    return {
      ok: parsed?.schemaVersion === 1 && String(parsed?.scormVersion || '') === '1.2' && slidesValid && interactionsValid,
      requiredSlides: slides.length,
      requiredInteractions: interactions.length,
      masteryScore: Number.isFinite(mastery) ? mastery : null,
      strategy: parsed?.completion?.strategy ? String(parsed.completion.strategy) : null,
      diagnosticsVersion: parsed?.diagnosticsVersion ? String(parsed.diagnosticsVersion) : null,
    };
  } catch {
    return { ok: false, requiredSlides: 0, requiredInteractions: 0, masteryScore: null, strategy: null, diagnosticsVersion: null };
  }
}

function instrumentation(initialValues = {}, masteryScore = null) {
  const seed = { ...initialValues };
  if (masteryScore != null && seed['cmi.student_data.mastery_score'] == null) {
    seed['cmi.student_data.mastery_score'] = String(masteryScore);
  }
  return `<script>(function(){
var trace=[],values=${JSON.stringify(seed)},initialized=false,finished=false,lastError='0';
function add(method,key,value){trace.push({method:method,key:key,value:value,at:Date.now()});}
function fail(code){lastError=String(code);return 'false';}
function get(k){return Object.prototype.hasOwnProperty.call(values,k)?String(values[k]):'';}
function set(k,v){values[String(k)]=String(v);return 'true';}
window.__AIRTRUST_COMPLETION_CERT={trace:trace,values:values,getState:function(){return {trace:trace.slice(),values:Object.assign({},values),initialized:initialized,finished:finished,lastError:lastError};}};
window.API={
 LMSInitialize:function(){add('LMSInitialize');if(initialized||finished)return fail('101');initialized=true;return 'true';},
 LMSGetValue:function(k){add('LMSGetValue',String(k));return get(String(k));},
 LMSSetValue:function(k,v){add('LMSSetValue',String(k),String(v));if(!initialized||finished)return fail('301');return set(k,v);},
 LMSCommit:function(){add('LMSCommit');if(!initialized||finished)return fail('301');return 'true';},
 LMSFinish:function(){add('LMSFinish');if(!initialized||finished)return fail('301');finished=true;return 'true';},
 LMSGetLastError:function(){add('LMSGetLastError');return lastError;},
 LMSGetErrorString:function(c){add('LMSGetErrorString',String(c));return String(c)==='0'?'No error':'SCORM error';},
 LMSGetDiagnostic:function(c){add('LMSGetDiagnostic',String(c));return String(c||lastError);}
};
window.API_1484_11={
 Initialize:function(){add('Initialize');if(initialized||finished)return fail('101');initialized=true;return 'true';},
 GetValue:function(k){add('GetValue',String(k));return get(String(k));},
 SetValue:function(k,v){add('SetValue',String(k),String(v));if(!initialized||finished)return fail('301');return set(k,v);},
 Commit:function(){add('Commit');if(!initialized||finished)return fail('301');return 'true';},
 Terminate:function(){add('Terminate');if(!initialized||finished)return fail('301');finished=true;return 'true';},
 GetLastError:function(){return lastError;},GetErrorString:function(c){return String(c);},GetDiagnostic:function(c){return String(c||lastError);}
};
})();</script>`;
}

function extractAnswerPlan(model) {
  const answers = [];
  const seen = new Set();
  function visit(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    const obj = value;
    const options = Array.isArray(obj.options) ? obj.options : Array.isArray(obj.alternatives) ? obj.alternatives : null;
    if (options?.length) {
      let indices = [];
      for (const key of ['correctIndex', 'answerIndex', 'correctOptionIndex']) {
        if (Number.isInteger(obj[key])) indices = [Number(obj[key])];
      }
      for (const key of ['correctAnswer', 'answer', 'correctOption']) {
        const raw = obj[key];
        if (typeof raw === 'number' && Number.isInteger(raw)) indices = [raw];
        if (typeof raw === 'string') {
          const idx = options.findIndex((option) => String(option?.value ?? option?.text ?? option?.label ?? option) === raw);
          if (idx >= 0) indices = [idx];
        }
      }
      const marked = options.map((option, i) => (option && typeof option === 'object' && (option.correct === true || option.isCorrect === true) ? i : -1)).filter((i) => i >= 0);
      if (marked.length) indices = marked;
      if (indices.length) answers.push({ path, indices: [...new Set(indices)].filter((i) => i >= 0 && i < options.length) });
    }
    for (const [key, child] of Object.entries(obj)) visit(child, path ? `${path}.${key}` : key);
  }
  visit(model);
  return answers;
}

async function requestAssetSession(context, token, courseId) {
  const r = await context.request.post(`${API}/api/lms/assets/session`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { curso_id: courseId, preview: true },
  });
  invariant(r.status() === 200, `ASSET_SESSION_HTTP_${courseId}_${r.status()}`);
}

async function fetchAsset(context, courseId, path) {
  const r = await context.request.get(`${API}/api/lms/scorm/assets/${TARGET_COMPANY_ID}/${courseId}/${path}`);
  return { status: r.status(), text: r.ok() ? await r.text() : '' };
}

function terminalState(values) {
  const ls = String(values?.['cmi.core.lesson_status'] || '').toLowerCase();
  const cs = String(values?.['cmi.completion_status'] || '').toLowerCase();
  const ss = String(values?.['cmi.success_status'] || '').toLowerCase();
  return TERMINAL_SCORM12.has(ls) || (TERMINAL_SCORM2004_COMPLETION.has(cs) && (TERMINAL_SCORM2004_SUCCESS.has(ss) || !ss || ss === 'unknown'));
}

function lessonStatus(values) {
  return String(values?.['cmi.core.lesson_status'] || values?.['cmi.completion_status'] || '').toLowerCase() || null;
}

function scoreRaw(values) {
  const raw = values?.['cmi.core.score.raw'] ?? values?.['cmi.score.raw'];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function getTrace(page) {
  return page.evaluate(() => window.__AIRTRUST_COMPLETION_CERT?.getState?.() || null);
}

async function driveFrame(page, frame, answerPlan, untilMs, maxSteps = MAX_STEPS) {
  const started = Date.now();
  let steps = 0;
  let idle = 0;
  while (Date.now() - started < untilMs && steps < maxSteps) {
    const state = await getTrace(page).catch(() => null);
    if (state?.values && terminalState(state.values)) break;

    const action = await frame.evaluate(({ plan }) => {
      const w = window;
      w.__AIRTRUST_CERT_DRIVER ??= { questionOrder: [], attempts: {}, planCursor: 0 };
      const st = w.__AIRTRUST_CERT_DRIVER;
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled;
      };
      const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
      const bad = /voltar|anterior|menu|sum[aá]rio|fechar|sair|cancelar/i;
      const good = /confirmar|responder|enviar|verificar|corrigir|continuar|pr[oó]ximo|avan[cç]ar|iniciar|come[cç]ar|prosseguir|finalizar|concluir|resultado|tentar novamente|refazer/i;

      const groups = new Map();
      for (const input of Array.from(document.querySelectorAll('input[type=radio]')).filter(visible)) {
        const key = input.name || clean(input.closest('fieldset,section,article,form,div')?.textContent).slice(0, 160) || 'radio';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(input);
      }
      if (groups.size) {
        for (const [key, inputs] of groups) {
          if (!st.questionOrder.includes(key)) st.questionOrder.push(key);
          const qIndex = st.questionOrder.indexOf(key);
          const planned = Array.isArray(plan?.[qIndex]?.indices) ? plan[qIndex].indices : [];
          const attempts = Number(st.attempts[key] || 0);
          const target = planned.length ? planned[Math.min(attempts, planned.length - 1)] : attempts % inputs.length;
          const input = inputs[Math.max(0, Math.min(target, inputs.length - 1))];
          if (input && !input.checked) input.click();
          st.attempts[key] = attempts + 1;
        }
      }

      for (const input of Array.from(document.querySelectorAll('input[type=checkbox]')).filter(visible)) {
        if (!input.checked) input.click();
      }

      const isProductChrome = (el, text) => {
        const id = String(el.id || '').toLowerCase();
        if (/^(menubtn|refbtn|closemenubtn|prev|previous|back)$/.test(id)) return true;
        if (bad.test(text)) return true;
        return Boolean(el.closest(
          'nav,aside,[role=navigation],[class*="sidebar" i],[class*="drawer" i],[class*="menu" i],[id*="menu" i],[class*="toc" i],[id*="toc" i]',
        ));
      };
      const items = Array.from(document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],a'))
        .filter(visible)
        .map((el, index) => {
          const text = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title);
          const id = clean(el.id);
          const key = clean(`${id} ${text}`);
          const multiToggle = Boolean(
            el.matches('[aria-pressed],[aria-checked],[role=checkbox]') ||
            el.closest('[class*="checklist" i],[id*="checklist" i],[class*="practice" i],[id*="practice" i]'),
          );
          return { el, text, id, key, index, multiToggle, chrome: isProductChrome(el, key) };
        })
        .filter((item) => !item.chrome);

      const alreadyClicked = (item) => item.el.dataset.airtrustCertClicked === '1';
      const markAndClick = (item, type) => {
        item.el.dataset.airtrustCertClicked = '1';
        item.el.click();
        return { type, text: (item.text || item.id || String(item.index)).slice(0, 80) };
      };

      // Multi-select practices/checklists must be satisfied before submit/navigation.
      const toggle = items.find((item) => item.multiToggle && !alreadyClicked(item));
      if (toggle) return markAndClick(toggle, 'content-toggle');

      // Once a decision enabled "next", advance immediately instead of cycling
      // through the remaining single-choice alternatives.
      const next = items.find((item) => /(^|\s)(next|pr[oó]ximo|avan[cç]ar|continuar|prosseguir)(\s|$)/i.test(item.key));
      if (next) return markAndClick(next, 'next');

      const submit = items.find((item) => /confirmar|responder|enviar|verificar|corrigir|submit/i.test(item.key));
      const genericChoices = items.filter((item) =>
        item.el.tagName.toLowerCase() !== 'a' &&
        !item.multiToggle &&
        !good.test(item.key) &&
        !/(^|\s)(finish|finalizar|concluir|resultado|start|iniciar|come[cç]ar)(\s|$)/i.test(item.key)
      );
      const priorChoice = genericChoices.some(alreadyClicked);

      // For single-choice decision cards: choose one option, then confirm.
      if (submit && priorChoice) return markAndClick(submit, 'submit-after-choice');

      const choice = genericChoices.find((item) => !alreadyClicked(item));
      if (choice) return markAndClick(choice, 'content-choice');

      if (submit) return markAndClick(submit, 'submit');

      const preferred = items.find((item) => good.test(item.key));
      if (preferred) return markAndClick(preferred, 'preferred');

      const safe = items.find((item) => /next|continue|start|finish|submit/i.test(item.key));
      if (safe) return markAndClick(safe, 'safe');

      return { type: 'none' };
    }, { plan: answerPlan }).catch(() => ({ type: 'frame-error' }));

    await page.evaluate(() => {
      const f = document.getElementById('scorm-frame');
      if (f?.contentWindow) f.contentWindow.postMessage({ type: 'lms:navigate', direction: 'next' }, window.location.origin);
    }).catch(() => undefined);

    if (action?.type === 'none') idle += 1;
    else idle = 0;
    steps += 1;
    await page.waitForTimeout(idle > 5 ? 180 : 90);
  }
  return steps;
}

async function unloadFrame(frame) {
  await frame.evaluate(() => {
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('unload'));
  }).catch(() => undefined);
}

function summarizeStalledSlide(model, lessonLocation) {
  const location = String(lessonLocation || '');
  if (!model || typeof model !== 'object' || !Array.isArray(model.slides)) {
    return { location: location || null, resolved: false };
  }
  let slide = null;
  let index = -1;
  const numeric = location.match(/^(\d+)(?:\/\d+)?$/);
  if (numeric) {
    index = Number(numeric[1]) - 1;
    slide = model.slides[index] ?? null;
  }
  if (!slide && location) {
    index = model.slides.findIndex((item) => String(item?.id || '') === location);
    slide = index >= 0 ? model.slides[index] : null;
  }
  if (!slide || typeof slide !== 'object') {
    return { location: location || null, resolved: false };
  }
  const options = Array.isArray(slide.options)
    ? slide.options
    : Array.isArray(slide.alternatives)
      ? slide.alternatives
      : [];
  return {
    location: location || null,
    resolved: true,
    index: index + 1,
    id: slide.id ? String(slide.id) : null,
    kind: slide.kind ? String(slide.kind) : null,
    required_decision: slide.requiredDecision === true,
    option_count: options.length,
    keys: Object.keys(slide).sort().slice(0, 40),
  };
}

async function captureVisibleControls(frame) {
  return frame.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const classify = (text) => {
      if (/pr[oó]ximo|avan[cç]ar|continuar|prosseguir|next/.test(text)) return 'next';
      if (/confirmar|responder|enviar|verificar|submit/.test(text)) return 'submit';
      if (/finalizar|concluir|finish|resultado/.test(text)) return 'finish';
      if (/voltar|anterior|previous|back/.test(text)) return 'back';
      if (/tentar novamente|refazer|retry/.test(text)) return 'retry';
      return 'choice_or_other';
    };
    const buttons = Array.from(document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],a'))
      .filter(visible)
      .map((el) => {
        const text = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title);
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          role: el.getAttribute('role'),
          category: classify(text),
          disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
        };
      });
    return {
      button_count: buttons.length,
      enabled_button_count: buttons.filter((item) => !item.disabled).length,
      buttons: buttons.slice(0, 20),
      radio_count: Array.from(document.querySelectorAll('input[type=radio]')).filter(visible).length,
      checkbox_count: Array.from(document.querySelectorAll('input[type=checkbox]')).filter(visible).length,
      role_radio_count: Array.from(document.querySelectorAll('[role=radio]')).filter(visible).length,
      role_option_count: Array.from(document.querySelectorAll('[role=option]')).filter(visible).length,
      select_count: Array.from(document.querySelectorAll('select')).filter(visible).length,
      details_count: Array.from(document.querySelectorAll('details')).filter(visible).length,
      summary_count: Array.from(document.querySelectorAll('summary')).filter(visible).length,
    };
  }).catch(() => null);
}

async function runPhase({ browser, token, course, manifest, phase, initialValues, maxDriveMs }) {
  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  const page = await context.newPage();
  const assetFailures = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes(`/api/lms/scorm/assets/${TARGET_COMPANY_ID}/${course.id}/`)) {
      assetFailures.push({ status: response.status(), path: new URL(response.url()).pathname.split('/').slice(-2).join('/') });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(safe(error.message)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(safe(msg.text())); });

  await requestAssetSession(context, token, course.id);
  const traceScript = instrumentation(initialValues, manifest.masteryScore);
  await page.route(`**/api/lms/scorm/preview/${course.id}`, async (route) => {
    const response = await route.fetch();
    let html = await response.text();
    const marker = '</body>';
    invariant(html.includes(marker), `SCORM_PREVIEW_BODY_MISSING:${course.id}`);
    const reloadScript = `<script>(function(){var f=document.getElementById('scorm-frame');if(!f)return;var u=new URL(f.src,location.href);u.searchParams.set('airtrust_cert',Date.now().toString(36));f.src=u.toString();})();</script>`;
    html = html.replace(marker, `${traceScript}${reloadScript}${marker}`);
    await route.fulfill({ response, body: html });
  });

  const response = await page.goto(`${API}/api/lms/scorm/preview/${course.id}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  invariant(response?.status() === 200, `SCORM_PREVIEW_HTTP_${course.id}_${response?.status()}`);
  const iframe = page.locator('#scorm-frame');
  await iframe.waitFor({ state: 'attached', timeout: 15_000 });
  const iframeHandle = await iframe.elementHandle();
  const frame = await iframeHandle?.contentFrame();
  invariant(frame, `SCORM_PACKAGE_FRAME_MISSING:${course.id}`);
  await frame.waitForURL(
    (url) => url.pathname.includes(`/api/lms/scorm/assets/${TARGET_COMPANY_ID}/${course.id}/`),
    { timeout: 15_000 },
  );
  await frame.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(350);

  const model = await frame.evaluate(() => window.AIRTRUST_COURSE_MODEL ?? null).catch(() => null);
  const answerPlan = extractAnswerPlan(model);
  const modelMeta = model && typeof model === 'object'
    ? {
        schema: typeof model.schema === 'string' ? model.schema : null,
        slide_count: Array.isArray(model.slides) ? model.slides.length : null,
        answer_plan_count: answerPlan.length,
      }
    : { schema: null, slide_count: null, answer_plan_count: 0 };

  let steps = 0;
  if (phase !== 'reopen-completed') {
    steps = await driveFrame(page, frame, answerPlan, maxDriveMs);
  } else {
    await page.waitForTimeout(1200);
  }
  const preUnloadTrace = await getTrace(page).catch(() => null);
  const preUnloadLocation =
    preUnloadTrace?.values?.['cmi.core.lesson_location'] ??
    preUnloadTrace?.values?.['cmi.location'] ??
    null;
  const visibleControls = await captureVisibleControls(frame);
  const stalledSlide = summarizeStalledSlide(model, preUnloadLocation);

  await unloadFrame(frame);
  await page.waitForTimeout(120);
  const trace = await getTrace(page);
  await context.close();
  invariant(trace, `SCORM_TRACE_MISSING:${course.id}:${phase}`);

  return {
    phase,
    initialized: trace.initialized === true,
    commit_observed: trace.trace.some((item) => item.method === 'LMSCommit' || item.method === 'Commit'),
    finish_observed: trace.finished === true,
    completion_reached: terminalState(trace.values),
    lesson_status: lessonStatus(trace.values),
    score_raw: scoreRaw(trace.values),
    lesson_location: trace.values?.['cmi.core.lesson_location'] ?? trace.values?.['cmi.location'] ?? null,
    suspend_data_present: Boolean(trace.values?.['cmi.suspend_data']),
    calls_after_finish: (() => {
      const i = trace.trace.findIndex((item) => item.method === 'LMSFinish' || item.method === 'Terminate');
      return i >= 0 && trace.trace.slice(i + 1).some((item) => ['LMSSetValue', 'LMSCommit', 'LMSFinish', 'SetValue', 'Commit', 'Terminate'].includes(item.method));
    })(),
    last_error: trace.lastError,
    steps,
    model: modelMeta,
    stalled_slide: stalledSlide,
    visible_controls: visibleControls,
    asset_failures: assetFailures.slice(0, 20),
    page_errors: pageErrors.slice(0, 10),
    console_errors: consoleErrors.slice(0, 10),
    values: trace.values,
  };
}

function summarizePhase(phase) {
  const out = { ...phase };
  delete out.values;
  return out;
}

function basePhasePass(phase) {
  return phase.initialized && phase.commit_observed && phase.finish_observed && !phase.calls_after_finish && phase.last_error === '0' && phase.asset_failures.length === 0 && phase.page_errors.length === 0;
}

async function certifyScormCourse(browser, token, listed) {
  const id = Number(listed.id);
  const detail = await courseDetail(token, id);
  const pkg = await activePackage(token, id);
  const legacyUnversioned = !pkg && Boolean(String(detail?.scorm_package_r2_prefix || '').trim());
  if (!pkg && !legacyUnversioned) {
    return {
      course_id: id,
      titulo: String(listed.titulo || detail.titulo || ''),
      tipo_conteudo: 'scorm',
      status: 'FAIL',
      reason: 'NO_ACTIVE_SCORM_PACKAGE',
      package_sha256: null,
    };
  }

  const probeContext = await browser.newContext();
  await requestAssetSession(probeContext, token, id);
  const manifestAsset = await fetchAsset(probeContext, id, 'airtrust-completion-manifest.json');
  const manifest = manifestAsset.status === 200 ? parseCompletionManifest(manifestAsset.text) : { ok: false, requiredSlides: 0, requiredInteractions: 0, masteryScore: null, strategy: null, diagnosticsVersion: null };
  await probeContext.close();

  if (!manifest.ok) {
    return {
      course_id: id,
      titulo: String(listed.titulo || detail.titulo || ''),
      tipo_conteudo: 'scorm',
      status: 'FAIL',
      reason: legacyUnversioned ? 'LEGACY_UNVERSIONED_OR_COMPLETION_MANIFEST_MISSING' : `COMPLETION_MANIFEST_INVALID_HTTP_${manifestAsset.status}`,
      package_sha256: pkg?.sha256 ?? null,
      legacy_unversioned: legacyUnversioned,
      manifest,
    };
  }

  const suspend = await runPhase({ browser, token, course: { id }, manifest, phase: 'suspend', initialValues: {}, maxDriveMs: Math.min(7_000, COURSE_TIMEOUT_MS) });
  const suspendValues = suspend.values;
  const suspendAlreadyCompleted = suspend.completion_reached;
  if (!suspendAlreadyCompleted) {
    if (String(detail?.scorm_versao || '1.2') === '2004') suspendValues['cmi.entry'] = 'resume';
    else suspendValues['cmi.core.entry'] = 'resume';
  }

  const complete = suspendAlreadyCompleted
    ? suspend
    : await runPhase({ browser, token, course: { id }, manifest, phase: 'resume-complete', initialValues: suspendValues, maxDriveMs: COURSE_TIMEOUT_MS });

  const finalValues = complete.values;
  if (String(detail?.scorm_versao || '1.2') === '2004') finalValues['cmi.entry'] = 'resume';
  else finalValues['cmi.core.entry'] = 'resume';
  const reopen = complete.completion_reached
    ? await runPhase({ browser, token, course: { id }, manifest, phase: 'reopen-completed', initialValues: finalValues, maxDriveMs: 2_000 })
    : null;

  const masteryPass = manifest.masteryScore == null || complete.score_raw == null || complete.score_raw >= manifest.masteryScore;
  const noDowngrade = !reopen || reopen.completion_reached;
  const pass = basePhasePass(suspend) && basePhasePass(complete) && complete.completion_reached && masteryPass && noDowngrade && (!reopen || basePhasePass(reopen));

  return {
    course_id: id,
    titulo: String(listed.titulo || detail.titulo || ''),
    tipo_conteudo: 'scorm',
    status: pass ? 'PASS' : 'FAIL',
    reason: pass ? null : !complete.completion_reached ? 'COMPLETION_NOT_REACHED' : !noDowngrade ? 'STATUS_DOWNGRADE_AFTER_REOPEN' : !masteryPass ? 'MASTERY_SCORE_NOT_REACHED' : 'SCORM_LIFECYCLE_OR_ASSET_FAILURE',
    package_sha256: pkg?.sha256 ?? null,
    legacy_unversioned: legacyUnversioned,
    stored_gate: pkg ? {
      publishable: pkg.publishable,
      runtime_status: pkg.storedRuntimeStatus,
      completion_reached: pkg.storedCompletionReached,
      lesson_status: pkg.storedLessonStatus,
      validator_version: pkg.validatorVersion,
    } : null,
    manifest,
    suspend: summarizePhase(suspend),
    completion: summarizePhase(complete),
    reopen: reopen ? summarizePhase(reopen) : null,
  };
}

async function certifyPptxCourse(browser, token, listed) {
  const id = Number(listed.id);
  const detail = await courseDetail(token, id);
  const context = await browser.newContext();
  const response = await context.request.get(`${API}/api/lms/pptx/asset/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const bytes = response.ok() ? await response.body() : Buffer.alloc(0);
  await context.close();
  const pass = response.status() === 200 && bytes.byteLength > 100;
  return {
    course_id: id,
    titulo: String(listed.titulo || detail.titulo || ''),
    tipo_conteudo: 'pptx',
    status: pass ? 'PASS' : 'FAIL',
    reason: pass ? null : `PPTX_ASSET_HTTP_${response.status()}`,
    asset_bytes: bytes.byteLength,
    version_tag: detail?.version_tag ? String(detail.version_tag) : null,
    note: 'Exact PPTX asset load is certified here; completion persistence is covered by canonical LMS local smoke/backend tests.',
  };
}

async function main() {
  await assertPinnedProduction();
  const token = await productionToken();
  const listed = await listCourses(token);
  invariant(
    COURSE_IDS.size === 0 || listed.length === COURSE_IDS.size,
    `CERT_COURSE_IDS_NOT_FOUND:expected=${COURSE_IDS.size}:found=${listed.length}`,
  );
  const browserType = BROWSER_NAME === 'webkit' ? webkit : chromium;
  invariant(BROWSER_NAME === 'chromium' || BROWSER_NAME === 'webkit', 'CERT_BROWSER_INVALID');
  const browser = await browserType.launch({ headless: true });
  const results = [];
  try {
    for (const course of listed) {
      const type = String(course?.tipo_conteudo || '').toLowerCase();
      try {
        if (type === 'scorm') results.push(await certifyScormCourse(browser, token, course));
        else if (type === 'pptx') results.push(await certifyPptxCourse(browser, token, course));
        else results.push({ course_id: Number(course.id), titulo: String(course.titulo || ''), tipo_conteudo: type, status: 'FAIL', reason: 'UNSUPPORTED_CONTENT_TYPE' });
      } catch (error) {
        results.push({ course_id: Number(course.id), titulo: String(course.titulo || ''), tipo_conteudo: type, status: 'FAIL', reason: safe(error?.message || error) });
      }
      process.stderr.write(`[cert] ${results.at(-1)?.status} ${course.id} ${String(course.titulo || '').slice(0, 80)}\n`);
    }
  } finally {
    await browser.close();
  }

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    production_sha: EXPECTED_SHA,
    empresa_id: TARGET_COMPANY_ID,
    browser: BROWSER_NAME,
    course_filter: COURSE_IDS.size > 0 ? [...COURSE_IDS].sort((a, b) => a - b) : null,
    course_count: results.length,
    pass_count: results.filter((r) => r.status === 'PASS').length,
    fail_count: results.filter((r) => r.status === 'FAIL').length,
    scorm_count: results.filter((r) => r.tipo_conteudo === 'scorm').length,
    pptx_count: results.filter((r) => r.tipo_conteudo === 'pptx').length,
    writes: 'none (authentication/company-selection/asset-session POSTs only; no LMS progress/enrollment/certificate/course mutations)',
    results,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ production_sha: report.production_sha, browser: report.browser, pass_count: report.pass_count, fail_count: report.fail_count, course_count: report.course_count })}\n`);
  if (report.fail_count > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`PRODUCTION_LMS_ACTIVE_CERTIFICATION_FAILED:${safe(error?.message || error)}`);
  process.exit(1);
});
