/* Synthetic SCORM 1.2 resume witness. Never claims grade, completion or certification. */
(function () {
  'use strict';
  var SCOPE = 'AIRTRUST_SCORM_RESUME_QA_V1';
  var api = window.API || (window.parent !== window ? window.parent.API : null);
  var state = { position: 1, ended: false, locked: false };
  var title = document.getElementById('position-title');
  var description = document.getElementById('position-description');
  var diagnostic = document.getElementById('diagnostic');
  var error = document.getElementById('error');
  var prev = document.getElementById('previous');
  var next = document.getElementById('next');
  var finish = document.getElementById('finish');
  function fail(code) {
    state.locked = true;
    error.hidden = false;
    error.textContent = 'QA SCORM bloqueada: ' + code;
    render();
  }
  function good(result) { return result === 'true'; }
  function checkError() { return typeof api.LMSGetLastError === 'function' && String(api.LMSGetLastError()) === '0'; }
  function get(field) {
    var value = String(api.LMSGetValue(field));
    if (!checkError()) throw Error('READ_FAILED_' + field);
    return value;
  }
  function set(field, value) {
    if (!good(api.LMSSetValue(field, String(value))) || !checkError()) throw Error('WRITE_FAILED_' + field);
  }
  function emitDiagnostics() {
    if (state.locked || !window.parent || typeof window.parent.postMessage !== 'function') return;
    window.parent.postMessage({
      type: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
      payload: { currentSlide: 'qa-pos-' + state.position,
        slides: { completed: state.position === 2 ? 1 : 0, total: 2 },
        assessment: { approved: false }, packageStatus: 'incomplete',
        updatedAt: new Date().toISOString() }
    }, '*');
  }
  function render() {
    title.textContent = 'Posição ' + state.position + ' de 2';
    title.dataset.qaPosition = String(state.position);
    description.textContent = state.position === 1 ? 'Etapa sintética de início.' : 'Etapa sintética de retomada.';
    prev.disabled = state.locked || state.ended || state.position === 1;
    next.disabled = state.locked || state.ended || state.position === 2;
    finish.disabled = state.locked || state.ended;
    diagnostic.textContent = state.ended ? 'Sessão encerrada.' : state.locked ? 'Falha: sem avanço até nova sessão.' : 'Sessão aberta.';
    if (!state.ended) emitDiagnostics();
  }
  function save(destination) {
    if (state.locked || state.ended || ![1, 2].includes(destination)) return;
    try {
      set('cmi.core.lesson_location', String(destination));
      set('cmi.suspend_data', JSON.stringify({ scope: SCOPE, position: destination }));
      if (!good(api.LMSCommit('')) || !checkError()) throw Error('COMMIT_FAILED');
      state.position = destination;
      render();
    } catch (e) { fail(String(e.message)); }
  }
  prev.addEventListener('click', function () { save(1); });
  next.addEventListener('click', function () { save(2); });
  finish.addEventListener('click', function () {
    if (state.locked || state.ended) return;
    try {
      if (!good(api.LMSFinish('')) || !checkError()) throw Error('FINISH_FAILED');
      state.ended = true;
      render();
    } catch (e) { fail(String(e.message)); }
  });
  try {
    if (!api || !['LMSInitialize','LMSGetValue','LMSGetLastError','LMSSetValue','LMSCommit','LMSFinish'].every(function (key) {
      return typeof api[key] === 'function';
    })) throw Error('API_SCORM12_MISSING');
    if (!good(api.LMSInitialize('')) || !checkError()) throw Error('INITIALIZE_FAILED');
    var location = get('cmi.core.lesson_location');
    var suspend = get('cmi.suspend_data');
    var fromLocation = location === '' ? null : Number(location);
    if (fromLocation !== null && ![1,2].includes(fromLocation)) throw Error('LOCATION_INVALID');
    var fromSuspend = null;
    if (suspend !== '') {
      var decoded = JSON.parse(suspend);
      if (decoded.scope !== SCOPE || ![1,2].includes(decoded.position)) throw Error('SUSPEND_SCOPE_INVALID');
      fromSuspend = decoded.position;
    }
    if (fromLocation !== null && fromSuspend !== null && fromLocation !== fromSuspend) throw Error('PERSISTENCE_CONFLICT');
    state.position = fromLocation || fromSuspend || 1;
    render();
  } catch (e) { fail(String(e.message)); }
}());
