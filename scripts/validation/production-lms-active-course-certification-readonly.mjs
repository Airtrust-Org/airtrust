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
    let options = null;
    for (const key of ['options', 'alternatives', 'choices', 'answers', 'alternativas', 'opcoes', 'respostas']) {
      if (Array.isArray(obj[key]) && obj[key].length) {
        options = obj[key];
        break;
      }
    }
    if (options?.length) {
      let indices = [];
      for (const key of ['correctIndex', 'answerIndex', 'correctOptionIndex', 'correctAnswerIndex']) {
        if (Number.isInteger(obj[key])) indices = [Number(obj[key])];
      }
      for (const key of ['correctAnswer', 'answer', 'correctOption', 'correct', 'correctLetter', 'rightAnswer', 'respostaCorreta', 'gabarito']) {
        const raw = obj[key];
        if (typeof raw === 'number' && Number.isInteger(raw)) indices = [raw];
        if (Array.isArray(raw) && raw.every((item) => Number.isInteger(item))) indices = raw.map(Number);
        if (typeof raw === 'string') {
          const normalized = raw.trim();
          const idx = options.findIndex((option) =>
            String(option?.value ?? option?.text ?? option?.label ?? option).trim() === normalized
          );
          if (idx >= 0) indices = [idx];
          else if (/^[A-Z]$/i.test(normalized)) {
            const letter = normalized.toUpperCase().charCodeAt(0) - 65;
            if (letter >= 0 && letter < options.length) indices = [letter];
          }
        }
      }
      const marked = options
        .map((option, i) => (
          option && typeof option === 'object' &&
          (option.correct === true || option.isCorrect === true || option.correctAnswer === true)
            ? i
            : -1
        ))
        .filter((i) => i >= 0);
      if (marked.length) indices = marked;
      const unique = [...new Set(indices)].filter((i) => i >= 0 && i < options.length);
      if (unique.length) {
        const slideMatch = path.match(/(?:^|\.)slides\[(\d+)\]/);
        answers.push({
          path,
          slideIndex: slideMatch ? Number(slideMatch[1]) + 1 : null,
          indices: unique,
        });
      }
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
  let sameErrorCount = 0;
  let lastErrorSignature = '';
  const diagnostics = {
    frame_error_count: 0,
    no_control_count: 0,
    last_location: null,
    last_action: null,
    error_examples: [],
    halted_due_to_repeated_error: false,
  };
  while (Date.now() - started < untilMs && steps < maxSteps) {
    const state = await getTrace(page).catch(() => null);
    if (state?.values && terminalState(state.values)) break;

    const currentLocation =
      state?.values?.['cmi.core.lesson_location'] ??
      state?.values?.['cmi.location'] ??
      '';
    const action = await frame.evaluate(({ plan, location }) => {
      const w = window;
      w.__AIRTRUST_CERT_DRIVER ??= {
        questionOrder: [],
        attempts: {},
        clickedByLocation: {},
        actionLog: [],
        assessmentCursorByLocation: {},
        planCursorByLocation: {},
      };
      const st = w.__AIRTRUST_CERT_DRIVER;
      st.clickedByLocation ??= {};
      st.actionLog ??= [];
      st.assessmentCursorByLocation ??= {};
      st.planCursorByLocation ??= {};
      const locationBase = String(location || 'unknown');
      // cmi.core.lesson_location tracks the slide, not the question inside it.
      // Use the learner-visible ordinal to avoid treating each new quiz question
      // as a previously-clicked answer on the same slide.
      const questionMatch = String(document.body?.innerText || '').match(
        /\b(?:quest[ãa]o|pergunta)\s*(\d+)\s*(?:\/|de)\s*(\d+)/i,
      );
      const questionNumber = questionMatch ? Number(questionMatch[1]) : null;
      const questionTotal = questionMatch ? Number(questionMatch[2]) : null;
      const locationKey = locationBase + (
        questionNumber && questionTotal
          ? ':question-' + questionNumber + '-of-' + questionTotal
          : ''
      );
      const slideMatch = locationBase.match(/^(\d+)/);
      const slideIndex = slideMatch ? Number(slideMatch[1]) : null;
      const plansHere = Array.isArray(plan)
        ? plan.filter((item) => item?.slideIndex === slideIndex)
        : [];
      const plannedQuestion = questionNumber
        ? plansHere.find((item) =>
            String(item?.path || '').includes('.questions[' + (questionNumber - 1) + ']') ||
            String(item?.path || '').includes('.assessmentQuestions[' + (questionNumber - 1) + ']'),
          ) || plansHere[questionNumber - 1]
        : null;
      const clicked = new Set(
        Array.isArray(st.clickedByLocation[locationKey])
          ? st.clickedByLocation[locationKey]
          : [],
      );
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          // Quiz controls can be below the iframe viewport and must be scrolled
          // into view, without exposing hidden menus or disabled elements.
          (
            (r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) ||
            el.matches('button.choice,button.answer,button.option,[data-quiz-choice],[data-module-quiz],#qNext,#quizNext')
          ) &&
          s.visibility !== 'hidden' &&
          s.display !== 'none' &&
          s.opacity !== '0' &&
          el.getAttribute('aria-hidden') !== 'true' &&
          !el.disabled
        );
      };
      const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
      const bad = /voltar|anterior|menu|sum[aá]rio|fechar|sair|cancelar/i;
      const good = /confirmar|responder|enviar|verificar|corrigir|continuar|pr[oó]xim[oa]|avan[cç]ar|iniciar|come[cç]ar|prosseguir|finalizar|concluir|resultado/i;
      const retry = /tentar novamente|refazer|retry/i;
      const forwardId = /^(?:next|nextbtn|btnnext|qnext|quiznext|continue|continuebtn|submitnext)$/i;
      const assessmentForwardId = /^(?:qnext|quiznext)$/i;
      const backwardId = /^(?:prev|prevbtn|previous|back|qprev|quizprev)$/i;

      const logAction = (type, item = null) => {
        st.actionLog.push({
          location: locationKey,
          type,
          index: item?.index ?? null,
          id: item?.id || null,
          role: item?.role || null,
        });
        if (st.actionLog.length > 120) st.actionLog.splice(0, st.actionLog.length - 120);
      };

      const closeMenu = Array.from(document.querySelectorAll('#closeMenuBtn,[data-action="close-menu"],.close-menu,.drawer-close')).find(visible);
      st.menuCloseByLocation ??= {};
      if (closeMenu && !st.menuCloseByLocation[locationKey]) {
        st.menuCloseByLocation[locationKey] = true;
        closeMenu.click();
        logAction('close-menu');
        return { type: 'close-menu', text: 'close-menu' };
      }

      const groups = new Map();
      for (const input of Array.from(document.querySelectorAll('input[type=radio]')).filter(visible)) {
        const key = input.name || clean(input.closest('fieldset,section,article,form,div')?.textContent).slice(0, 160) || 'radio';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(input);
      }
      if (groups.size) {
        let groupPosition = 0;
        for (const [key, inputs] of groups) {
          if (!st.questionOrder.includes(key)) st.questionOrder.push(key);
          const qIndex = st.questionOrder.indexOf(key);
          const planned =
            (Array.isArray(plansHere?.[groupPosition]?.indices) && plansHere[groupPosition].indices) ||
            (Array.isArray(plan?.[qIndex]?.indices) && plan[qIndex].indices) ||
            [];
          const attempts = Number(st.attempts[key] || 0);
          const target = planned.length ? planned[Math.min(attempts, planned.length - 1)] : attempts % inputs.length;
          const input = inputs[Math.max(0, Math.min(target, inputs.length - 1))];
          if (input && !input.checked) input.click();
          st.attempts[key] = attempts + 1;
          groupPosition += 1;
        }
      }

      for (const input of Array.from(document.querySelectorAll('input[type=checkbox]')).filter(visible)) {
        if (!input.checked) input.click();
      }

      const isProductChrome = (el, text) => {
        const id = String(el.id || '').toLowerCase();
        const className = clean(el.className).toLowerCase();
        const semanticAction =
          good.test(text) ||
          forwardId.test(id) ||
          /^(start|finish|submit|iniciar|come[cç]ar|finalizar|concluir)$/i.test(id);
        if (/^(menubtn|refbtn|refsbtn|closemenubtn|resetbtn)$/i.test(id) || backwardId.test(id)) return true;
        if (semanticAction) return false;
        if (/(^|\s)(icon-btn|menu-btn|close-menu|drawer-close|skip-link)(\s|$)/i.test(className)) return true;
        if (bad.test(text)) return true;
        return Boolean(el.closest(
          'aside,[class*="sidebar" i],[class*="drawer" i],[class*="menu" i],[id*="menu" i],[class*="toc" i],[id*="toc" i]',
        ));
      };
      const items = Array.from(document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],a'))
        .filter(visible)
        .map((el, index) => {
          const text = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title);
          const id = clean(el.id);
          const key = clean(`${id} ${text}`);
          const className = clean(el.className);
          const multiToggle = Boolean(
            el.matches('[aria-pressed],[aria-checked],[role=checkbox]') ||
            el.closest('[class*="checklist" i],[id*="checklist" i]')
          );
          const role = clean(el.getAttribute('role'));
          const name = clean(el.getAttribute('name'));
          const ariaPressed = clean(el.getAttribute('aria-pressed'));
          const ariaChecked = clean(el.getAttribute('aria-checked'));
          const signature = [index, id, role, name, el.tagName.toLowerCase()].join(':');
          return {
            el,
            text,
            id,
            key,
            index,
            role,
            name,
            className,
            ariaPressed,
            ariaChecked,
            signature,
            multiToggle,
            chrome: isProductChrome(el, key),
          };
        })
        .filter((item) => !item.chrome);

      const alreadyClicked = (item) => clicked.has(item.signature);
      const persistClicked = () => {
        st.clickedByLocation[locationKey] = Array.from(clicked).slice(-120);
      };
      const markAndClick = (item, type) => {
        clicked.add(item.signature);
        persistClicked();
        logAction(type, item);
        item.el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        item.el.click();
        return { type, text: (item.text || item.id || String(item.index)).slice(0, 80) };
      };

      const isChoiceButton = (item) =>
        /(^|\s)(choice|option|answer)(\s|$)/i.test(item.className);
      const assessmentChoices = items.filter((item) =>
        /(^|\s)(answer|option)(\s|$)/i.test(item.className) &&
        !forwardId.test(item.id) &&
        !backwardId.test(item.id)
      );
      // A disabled qNext must not make the driver treat quiz choices as navigation.
      const assessmentMode =
        Boolean(document.querySelector('#qNext,#quizNext')) && assessmentChoices.length > 0;
      if (assessmentMode) {
        const cursor = Number(st.assessmentCursorByLocation[locationKey] || 0);
        const quizKey = `${locationKey}:assessment:${cursor}`;
        st.quizChoicesTried ??= {};
        const tried = new Set(st.quizChoicesTried[quizKey] || []);
        const selected = assessmentChoices.find((item) =>
          /(^|\s)(selected|active)(\s|$)/i.test(item.className) ||
          item.ariaPressed === 'true' ||
          item.ariaChecked === 'true'
        );
        const nextQuestion = items.find((item) => assessmentForwardId.test(item.id));
        const assessmentFinish = items.find((item) =>
          !isChoiceButton(item) &&
          /concluir\s+(?:a\s+)?avalia[cç][aã]o|finalizar\s+(?:a\s+)?avalia[cç][aã]o|encerrar\s+avalia[cç][aã]o|enviar\s+respostas|concluir\s+quiz/i.test(item.key)
        );
        if (selected && nextQuestion) {
          st.assessmentCursorByLocation[locationKey] = cursor + 1;
          return markAndClick(nextQuestion, 'assessment-next');
        }
        if (selected && assessmentFinish && !nextQuestion) {
          return markAndClick(assessmentFinish, 'assessment-finish');
        }
        const planned = plannedQuestion?.indices || plansHere[cursor]?.indices || [];
        const candidateOrder = [
          ...planned.map((index) => assessmentChoices[Math.max(0, Math.min(Number(index), assessmentChoices.length - 1))]),
          ...assessmentChoices,
        ].filter(Boolean);
        const candidate = candidateOrder.find((item) => !tried.has(item.signature));
        if (candidate) {
          tried.add(candidate.signature);
          st.quizChoicesTried[quizKey] = Array.from(tried);
          return markAndClick(candidate, 'assessment-answer');
        }
        if (assessmentFinish && !nextQuestion && candidateOrder.every((item) => tried.has(item.signature))) {
          return markAndClick(assessmentFinish, 'assessment-finish');
        }
        // Do not fake progress when no valid answer/next control exists.
        return { type: 'none' };
      }

      // Quizzes in the newer M8 player expose data-quiz-choice and data-next,
      // while the LMS location remains fixed for all 10 questions on a slide.
      // The question-specific locationKey above resets attempts per question.
      const inlineQuizChoices = items.filter((item) => item.el.matches('[data-quiz-choice]'));
      if (inlineQuizChoices.length) {
        const inlineNext = items.find((item) => item.el.matches('[data-next]'));
        if (inlineNext) return markAndClick(inlineNext, 'inline-quiz-next');
        const chosen = new Set(st.inlineChoicesTried?.[locationKey] || []);
        const wanted = (plannedQuestion?.indices || [])[0];
        const candidates = [
          Number.isInteger(wanted) ? inlineQuizChoices[wanted] : null,
          ...inlineQuizChoices,
        ].filter(Boolean);
        const option = candidates.find((item) => !chosen.has(item.signature));
        if (option) {
          st.inlineChoicesTried ??= {};
          chosen.add(option.signature);
          st.inlineChoicesTried[locationKey] = Array.from(chosen);
          return markAndClick(option, 'inline-quiz-choice');
        }
        return { type: 'none' };
      }

      // Multi-select practices/checklists must be satisfied before submit/navigation.
      const finalizeAssessment = items.find((item) =>
        !isChoiceButton(item) &&
        /concluir\s+(?:a\s+)?avalia[cç][aã]o|finalizar\s+(?:a\s+)?avalia[cç][aã]o/i.test(item.key)
      );
      if (finalizeAssessment && !alreadyClicked(finalizeAssessment)) {
        return markAndClick(finalizeAssessment, 'assessment-finish');
      }

      const toggle = items.find((item) => item.multiToggle && !alreadyClicked(item));
      if (toggle) return markAndClick(toggle, 'content-toggle');

      const exactNext = items.find((item) => forwardId.test(item.id));
      if (exactNext) return markAndClick(exactNext, 'next');

      // A satisfied required decision enables the forward control. Advance
      // before considering other answers, but never treat an answer card that
      // happens to contain "próximo" as navigation.
      const enabledTextNext = items.find((item) =>
        !/(^|\s)(choice|option|answer)(\s|$)/i.test(item.className) &&
        /(^|\s)(next|pr[oó]xim[oa]|avan[cç]ar|continuar|prosseguir)(\s|$)/i.test(item.key)
      );
      if (enabledTextNext) return markAndClick(enabledTextNext, 'next');

      // A choice may contain words like "verificar"/"próximo" in its lesson text.
      // Classification must use the button role/class before its text.
      const contentChoices = items.filter((item) =>
        isChoiceButton(item) &&
        !forwardId.test(item.id) &&
        !backwardId.test(item.id)
      );
      const submit = items.find((item) =>
        !isChoiceButton(item) &&
        /confirmar|responder|enviar|verificar|corrigir|submit/i.test(item.key)
      );
      const untriedChoices = contentChoices.filter((item) => !alreadyClicked(item));
      if (untriedChoices.length) {
        const planCursor = Number(st.planCursorByLocation[locationKey] || 0);
        const planned = plansHere[planCursor]?.indices || [];
        const suggested = planned.length
          ? contentChoices[Math.max(0, Math.min(Number(planned[0]), contentChoices.length - 1))]
          : null;
        const target = suggested && !alreadyClicked(suggested)
          ? suggested
          : untriedChoices[0];
        return markAndClick(target, 'content-choice');
      }

      if (submit && !alreadyClicked(submit)) return markAndClick(submit, 'submit-after-choice');

      const textNext = items.find((item) =>
        !isChoiceButton(item) &&
        /(^|\s)(next|pr[oó]xim[oa]|avan[cç]ar|continuar|prosseguir)(\s|$)/i.test(item.key)
      );
      if (textNext) return markAndClick(textNext, 'next');

      const fallbackChoices = items.filter((item) =>
        item.el.tagName.toLowerCase() !== 'a' &&
        !isChoiceButton(item) &&
        !item.multiToggle &&
        !good.test(item.key) &&
        !retry.test(item.key) &&
        !forwardId.test(item.id) &&
        !backwardId.test(item.id) &&
        !/(reset|menu|ref|zoom|skip|close|nav)/i.test(item.id + ' ' + item.className)
      );
      const fallback = fallbackChoices.find((item) => !alreadyClicked(item));
      if (fallback) return markAndClick(fallback, 'content-choice-generic');

      // Legacy quizzes sometimes require an explicit restart after feedback locks
      // all options. At most one reset per location is attempted in read-only preview.
      const visibleDisabledChoices = Array.from(document.querySelectorAll('button.option,button.choice,button.answer'))
        .some((el) => el.disabled);
      st.resetTriedByLocation ??= {};
      if (visibleDisabledChoices && !st.resetTriedByLocation[locationKey]) {
        const reset = document.getElementById('resetBtn');
        if (reset && visible(reset)) {
          st.resetTriedByLocation[locationKey] = true;
          delete st.clickedByLocation[locationKey];
          if (st.quizChoicesTried) {
            for (const key of Object.keys(st.quizChoicesTried)) {
              if (key.startsWith(locationKey + ':assessment:')) delete st.quizChoicesTried[key];
            }
          }
          reset.click();
          logAction('bounded-retry');
          return { type: 'bounded-retry' };
        }
      }

      const preferred = items.find((item) => !isChoiceButton(item) && !alreadyClicked(item) && good.test(item.key));
      if (preferred) return markAndClick(preferred, 'preferred');

      const safe = items.find((item) =>
        !isChoiceButton(item) &&
        !alreadyClicked(item) &&
        (forwardId.test(item.id) || /next|continue|start|finish|submit/i.test(item.key))
      );
      if (safe) return markAndClick(safe, 'safe');

      const retryAction = items.find((item) => retry.test(item.key) && !/^resetbtn$/i.test(item.id));
      if (retryAction) return markAndClick(retryAction, 'retry');

      return { type: 'none' };
    }, { plan: answerPlan, location: currentLocation }).catch((error) => ({
      type: 'frame-error',
      message: safe(error?.message || String(error)),
    }));

    // Fallback only when the package exposes no usable visible control.
    if (action?.type === 'none') {
      await page.evaluate(() => {
        const f = document.getElementById('scorm-frame');
        if (f?.contentWindow) f.contentWindow.postMessage({ type: 'lms:navigate', direction: 'next' }, window.location.origin);
      }).catch(() => undefined);
    }

    diagnostics.last_location = String(currentLocation || '').slice(0, 100);
    diagnostics.last_action = action?.type || null;
    if (action?.type === 'frame-error') {
      diagnostics.frame_error_count += 1;
      const signature = diagnostics.last_location + ':' + String(action.message || '');
      sameErrorCount = signature === lastErrorSignature ? sameErrorCount + 1 : 1;
      lastErrorSignature = signature;
      if (diagnostics.error_examples.length < 3 &&
          !diagnostics.error_examples.some((item) => item.message === action.message)) {
        diagnostics.error_examples.push({
          location: diagnostics.last_location,
          message: String(action.message || '').slice(0, 250),
        });
      }
      if (sameErrorCount >= 8) {
        diagnostics.halted_due_to_repeated_error = true;
        break;
      }
    } else {
      sameErrorCount = 0;
      lastErrorSignature = '';
    }
    if (action?.type === 'none') {
      idle += 1;
      diagnostics.no_control_count += 1;
    } else {
      idle = 0;
    }
    steps += 1;
    await page.waitForTimeout(idle > 5 ? 180 : 90);
  }
  return { steps, diagnostics };
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
  const rawQuestions = slide.questions ?? slide.assessmentQuestions ?? null;
  const questionCollection = Array.isArray(rawQuestions)
    ? rawQuestions
    : rawQuestions && typeof rawQuestions === 'object'
      ? Object.values(rawQuestions).filter((item) => item && typeof item === 'object')
      : [];
  const firstQuestion = questionCollection.find((item) => item && typeof item === 'object');
  const questionOptions = firstQuestion && typeof firstQuestion === 'object'
    ? ['options', 'alternatives', 'choices', 'answers', 'alternativas'].filter((key) => Array.isArray(firstQuestion[key]))
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
    question_collection_type: Array.isArray(rawQuestions) ? 'array' : rawQuestions === null ? 'none' : typeof rawQuestions,
    question_collection_keys: rawQuestions && !Array.isArray(rawQuestions) && typeof rawQuestions === 'object'
      ? Object.keys(rawQuestions).sort().slice(0, 30)
      : [],
    question_count: questionCollection.length,
    question_shape: firstQuestion
      ? { keys: Object.keys(firstQuestion).sort().slice(0, 40), option_array_keys: questionOptions }
      : null,
  };
}

async function captureVisibleControls(frame) {
  return frame.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        el.getAttribute('aria-hidden') !== 'true'
      );
    };
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const classify = (text, id) => {
      if (/^(qnext|quiznext|next|nextbtn|btnnext|continue|continuebtn)$/i.test(id)) return 'next';
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
        const id = String(el.id || '');
        return {
          tag: el.tagName.toLowerCase(),
          id: id || null,
          role: el.getAttribute('role'),
          class_name: String(el.className || '').slice(0, 160) || null,
          parent_class_name: String(el.parentElement?.className || '').slice(0, 100) || null,
          expanded: el.getAttribute('aria-expanded'),
          data_keys: Object.keys(el.dataset || {}).sort().slice(0, 12),
          aria_pressed: el.getAttribute('aria-pressed'),
          aria_checked: el.getAttribute('aria-checked'),
          category: classify(text, id),
          disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
        };
      });
    const contentButtons = buttons.filter((item) =>
      !/(menu|drawer|sidebar|toc|skip-link|icon-btn)/i.test(String(item.class_name || '')) &&
      !/^(menuBtn|refBtn|closeMenuBtn)$/i.test(String(item.id || ''))
    );
    return {
      button_count: buttons.length,
      enabled_button_count: buttons.filter((item) => !item.disabled).length,
      buttons: buttons.slice(0, 20),
      content_buttons: contentButtons.slice(-30),
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

async function captureDriverState(frame) {
  return frame.evaluate(() => {
    const st = window.__AIRTRUST_CERT_DRIVER;
    if (!st || typeof st !== 'object') return null;
    const clickedByLocation = st.clickedByLocation && typeof st.clickedByLocation === 'object'
      ? Object.fromEntries(
          Object.entries(st.clickedByLocation).map(([location, values]) => [
            location,
            Array.isArray(values) ? values.length : 0,
          ]),
        )
      : {};
    return {
      clicked_by_location: clickedByLocation,
      recent_actions: Array.isArray(st.actionLog) ? st.actionLog.slice(-30) : [],
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
        assessment_question_shape: (() => {
          const slide = Array.isArray(model.slides)
            ? model.slides.find((item) => item?.kind === 'assessment' && Array.isArray(item.assessmentQuestions) && item.assessmentQuestions.length)
            : null;
          const question = slide?.assessmentQuestions?.[0];
          return question && typeof question === 'object'
            ? { keys: Object.keys(question).sort().slice(0, 25), question_count: slide.assessmentQuestions.length }
            : null;
        })(),
      }
    : { schema: null, slide_count: null, answer_plan_count: 0 };

  let steps = 0;
  let driveDiagnostics = null;
  if (phase !== 'reopen-completed') {
    const stepLimit = Math.max(
      MAX_STEPS,
      Math.max(Number(modelMeta.slide_count || 0), Number(manifest.requiredSlides || 0)) * 5,
      Number(manifest.requiredInteractions || 0) * 8,
    );
    const drive = await driveFrame(page, frame, answerPlan, maxDriveMs, stepLimit);
    steps = drive.steps;
    driveDiagnostics = drive.diagnostics;
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
  const driverState = await captureDriverState(frame);
  let diagnosticScreenshot = null;
  const focusedDiagnostics = COURSE_IDS.size > 0 && COURSE_IDS.size <= 6;
  if (
    focusedDiagnostics &&
    phase === 'resume-complete' &&
    !terminalState(preUnloadTrace?.values || {})
  ) {
    const outputFile = path.join(
      path.dirname(REPORT_PATH),
      'lms-active-certification-diagnostics',
      BROWSER_NAME,
      `course-${course.id}-stalled.png`,
    );
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const captured = await frame.locator('body').screenshot({
      path: outputFile,
      timeout: 5_000,
      animations: 'disabled',
    }).then(() => true).catch(() => false);
    if (captured) diagnosticScreenshot = outputFile;
  }

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
    drive_diagnostics: driveDiagnostics,
    model: modelMeta,
    stalled_slide: stalledSlide,
    visible_controls: visibleControls,
    driver_state: driverState,
    diagnostic_screenshot: diagnosticScreenshot,
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

  const slideCount = Math.max(
    Number(manifest.requiredSlides || 0),
    Number(suspend.model?.slide_count || 0),
  );
  const completionBudgetMs = Math.max(COURSE_TIMEOUT_MS, Math.min(180_000, slideCount * 320));
  const complete = suspendAlreadyCompleted
    ? suspend
    : await runPhase({ browser, token, course: { id }, manifest, phase: 'resume-complete', initialValues: suspendValues, maxDriveMs: completionBudgetMs });

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
  const assetPass = response.status() === 200 && bytes.byteLength > 100;
  const generatesQualification =
    Number(detail?.gerar_qualificacao_ao_concluir ?? listed?.gerar_qualificacao_ao_concluir ?? 0) === 1 ||
    detail?.gerar_qualificacao_ao_concluir === true ||
    listed?.gerar_qualificacao_ao_concluir === true;
  const completionCertifiable = !generatesQualification;
  const pass = assetPass && completionCertifiable;
  const reason = !assetPass
    ? `PPTX_ASSET_HTTP_${response.status()}`
    : generatesQualification
      ? 'PPTX_QUALIFYING_COMPLETION_EVIDENCE_REQUIRED'
      : null;
  return {
    course_id: id,
    titulo: String(listed.titulo || detail.titulo || ''),
    tipo_conteudo: 'pptx',
    status: pass ? 'PASS' : 'FAIL',
    reason,
    asset_bytes: bytes.byteLength,
    generates_qualification: generatesQualification,
    version_tag: detail?.version_tag ? String(detail.version_tag) : null,
    note: generatesQualification
      ? 'Asset load passed, but the current backend intentionally blocks qualifying PPTX completion until server-validated evidence exists.'
      : 'Exact PPTX asset load certified; this course does not mint a qualification.',
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
