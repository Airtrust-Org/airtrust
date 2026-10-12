/**
 * A genuinely interactive, disposable SCORM 1.2 Factory/M8 acceptance SCO.
 * No completion is emitted until the synthetic learner clicks the correct
 * answer, submits the assessment, and advances via actual DOM controls.
 * The real production Worker verifies these actions inside Browser Rendering.
 */
import { strToU8 } from 'fflate';

export function buildInteractiveM8QaFiles(courseId, packageVersion) {
  const model = {
    schema: 'AIRTRUST_TRAINING_MODEL_M8',
    courseId,
    packageVersion,
    navigationGate: 'module-assessment',
    slides: [{ id: 'qa-slide-1', kind: 'assessment', media: 'media/qa-visual.svg' }],
    assessment: {
      masteryScore: 70,
      questions: [{
        id: 'qa-interaction-1',
        correct: 1,
        a: ['Ignorar', 'Confirmar após verificar'],
      }],
    },
    auditClosure: {
      typographyMinPx: 18,
      moduleGate: true,
      certifyingScoreChanged: false,
      semanticVisualCoverage: '1/1 authored units have meaningful local visuals',
      storageScope: 'course+enrollment+active-cycle',
    },
  };
  const data = {
    courseId,
    packageVersion,
    slides: [{
      id: 'qa-slide-1', kind: 'assessment', chapter: 1,
      questions: [{ q: 'Qual ação conclui a verificação?', options: ['Ignorar', 'Confirmar após verificar'], answer: 1 }],
    }],
  };
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<title>AirTrust QA SCORM M8</title><link rel="stylesheet" href="styles.css"></head>' +
    '<body><main><h1>Avaliação QA</h1><img src="media/qa-visual.svg" alt="Fluxo de verificação">' +
    '<p>Selecione a resposta correta antes de avançar.</p>' +
    '<button data-answer="0" type="button">Ignorar</button>' +
    '<button data-answer="1" type="button">Confirmar após verificar</button>' +
    '<button id="next" type="button" disabled>Avançar</button></main>' +
    '<script src="scorm.js"></script><script src="course-model.js"></script>' +
    '<script src="course_data.js"></script><script src="app.js"></script>' +
    '</body></html>';
  const app = String.raw`
(function () {
  // Browser Rendering injects API in this window. The real AirTrust learner
  // launch mounts the SCO in a same-origin iframe whose SCORM API is on parent.
  var api = window.API;
  if (!api) {
    try { api = window.parent && window.parent.API; }
    catch (_crossOrigin) { api = null; }
  }
  if (!api || api.LMSInitialize('') !== 'true') throw Error('QA_SCORM_API_NOT_INITIALIZED');
  var state = {
    active: 0, done: [], assess: { 1: { passed: false } },
    choices: {}, completed: false, ended: false, mode: 'journey',
  };
  var modelState = {
    a: 0, c: [], d: {}, g: {}, q: {}, best: 0,
    assessmentPassed: false, passed: false, failed: false, assessmentEvaluated: false,
  };
  var selected = null;
  var apiAdapter = window.AirTrustSCORM;
  var submit = document.createElement('button');
  submit.id = 'submitAssessment';
  submit.type = 'button';
  submit.textContent = 'Concluir avaliação';
  submit.disabled = true;
  var complete = document.createElement('button');
  complete.id = 'completeCourse';
  complete.type = 'button';
  complete.textContent = 'Concluir curso';
  complete.hidden = true;
  document.querySelector('main').appendChild(submit);
  document.querySelector('main').appendChild(complete);
  var persistModelState = function () {
    api.LMSSetValue('cmi.suspend_data', JSON.stringify(modelState));
    api.LMSCommit('');
  };
  var closed = false;
  window.__AIRTRUST_PLAYER_TEST__ = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getModelState: function () { return JSON.parse(JSON.stringify(modelState)); },
  };
  if (!apiAdapter || typeof apiAdapter.get !== 'function') throw Error('QA_SCORM_ADAPTER_NOT_INITIALIZED');
  api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
  api.LMSSetValue('cmi.core.lesson_location', '1/1');
  persistModelState();
  api.LMSGetLastError();
  api.LMSGetErrorString('0');
  api.LMSGetDiagnostic('0');
  document.querySelectorAll('button[data-answer]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (state.ended) return;
      selected = Number(button.getAttribute('data-answer'));
      modelState.q['qa-interaction-1'] = selected;
      persistModelState();
      submit.disabled = false;
      document.querySelector('#next').disabled = false;
    });
  });
  document.querySelector('#next').addEventListener('click', function () {
    if (state.ended || selected !== 1) return;
    if (!state.assess[1].passed) {
      state.assess[1].passed = true;
    }
  });
  submit.addEventListener('click', function () {
    if (modelState.q['qa-interaction-1'] === undefined || modelState.assessmentEvaluated) return;
    modelState.assessmentEvaluated = true;
    modelState.assessmentPassed = modelState.q['qa-interaction-1'] === 1;
    modelState.best = modelState.assessmentPassed ? 100 : 0;
    modelState.failed = !modelState.assessmentPassed;
    state.assess[1].passed = modelState.assessmentPassed;
    api.LMSSetValue('cmi.core.score.raw', String(modelState.best));
    api.LMSSetValue('cmi.core.lesson_status', modelState.assessmentPassed ? 'passed' : 'failed');
    persistModelState();
    submit.disabled = true;
    complete.hidden = !modelState.assessmentPassed;
  });
  complete.addEventListener('click', function () {
    if (!modelState.assessmentPassed || modelState.passed) return;
    modelState.passed = true;
    modelState.c = ['qa-slide-1'];
    state.done = [0];
    state.completed = true;
    state.ended = true;
    state.mode = 'review';
    api.LMSSetValue('cmi.core.lesson_status', 'passed');
    api.LMSSetValue('cmi.core.score.raw', String(modelState.best));
    api.LMSSetValue('cmi.core.lesson_location', '1/1');
    persistModelState();
    document.querySelector('#next').disabled = true;
    window.parent.postMessage({
      type: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
      payload: { currentSlide: 'qa-slide-1', slides: { completed: 1, total: 1 },
        assessment: { approved: true, score: 100 }, packageStatus: 'passed',
        updatedAt: new Date().toISOString() },
    }, '*');
  });
  function finish() {
    if (closed) return;
    closed = true;
    api.LMSFinish('');
  }
  window.addEventListener('beforeunload', finish);
  window.addEventListener('pagehide', finish);
  window.addEventListener('unload', finish);
})();
`;
  const modelJs = 'window.AIRTRUST_COURSE_MODEL = ' + JSON.stringify(model) + ';';
  const dataJs = 'window.COURSE_DATA = ' + JSON.stringify(data) + ';';
  return {
    'index.html': strToU8(html),
    'scorm.js': strToU8(String.raw`(function () {
  var api = window.API;
  if (!api) { try { api = window.parent && window.parent.API; } catch (_) { api = null; } }
  if (!api) throw Error('QA_SCORM_API_MISSING');
  var finished = false;
  window.AirTrustSCORM = {
    initialize: function () { return String(api.LMSInitialize('')).toLowerCase() === 'true'; },
    get: function (key) { return String(api.LMSGetValue(key) ?? ''); },
    set: function (key, value) { return String(api.LMSSetValue(key, String(value))).toLowerCase() === 'true'; },
    commit: function () { return String(api.LMSCommit('')).toLowerCase() === 'true'; },
    finish: function () { if (finished) return true; finished = String(api.LMSFinish('')).toLowerCase() === 'true'; return finished; },
    isFinished: function () { return finished; }
  };
})();`),
    'app.js': strToU8(app),
    'course-model.js': strToU8(modelJs),
    'course_data.js': strToU8(dataJs),
    'styles.css': strToU8('body{font-size:18px}button{font-size:18px;margin:10px}img{display:block;width:160px}'),
    'media/qa-visual.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 60"><rect width="160" height="60" rx="8" fill="#d5e6fa"/><path d="M22 30h116" stroke="#245078" stroke-width="4"/><circle cx="80" cy="30" r="12" fill="#226b76"/></svg>'),
  };
}
