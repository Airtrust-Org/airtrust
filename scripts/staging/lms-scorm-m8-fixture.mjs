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
    '<script src="course-model.js"></script><script src="course_data.js"></script><script src="app.js"></script>' +
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
  var selected = null;
  var closed = false;
  window.__AIRTRUST_PLAYER_TEST__ = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
  };
  api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
  api.LMSSetValue('cmi.core.lesson_location', '1/1');
  api.LMSCommit('');
  api.LMSGetLastError();
  api.LMSGetErrorString('0');
  api.LMSGetDiagnostic('0');
  document.querySelectorAll('button[data-answer]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (state.ended) return;
      selected = Number(button.getAttribute('data-answer'));
      document.querySelector('#next').disabled = false;
    });
  });
  document.querySelector('#next').addEventListener('click', function () {
    if (state.ended || selected !== 1) return;
    if (!state.assess[1].passed) {
      state.assess[1].passed = true;
      api.LMSSetValue('cmi.core.score.raw', '100');
      return;
    }
    state.done = [0];
    state.completed = true;
    state.ended = true;
    state.mode = 'review';
    api.LMSSetValue('cmi.core.lesson_status', 'passed');
    api.LMSSetValue('cmi.core.lesson_location', '1/1');
    api.LMSCommit('');
    window.parent.postMessage({
      type: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
      payload: { currentSlide: 'qa-slide-1', slides: { completed: 1, total: 1 },
        assessment: { approved: true, score: 100 }, packageStatus: 'passed',
        updatedAt: new Date().toISOString() },
    }, '*');
    document.querySelector('#next').disabled = true;
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
    'app.js': strToU8(app),
    'course-model.js': strToU8(modelJs),
    'course_data.js': strToU8(dataJs),
    'styles.css': strToU8('body{font-size:18px}button{font-size:18px;margin:10px}img{display:block;width:160px}'),
    'media/qa-visual.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 60"><rect width="160" height="60" rx="8" fill="#d5e6fa"/><path d="M22 30h116" stroke="#245078" stroke-width="4"/><circle cx="80" cy="30" r="12" fill="#226b76"/></svg>'),
  };
}
