/**
 * Blocos de runtime do wrapper SCORM injetados em `buildLaunchPage`
 * (routes/lms-assets.ts), extraídos para módulo próprio para manter o arquivo
 * do wrapper dentro do teto de tamanho do guard de arquitetura.
 *
 * Cada função retorna JS como string. O texto é idêntico ao que estava inline
 * no template do wrapper — inclusive o escape duplo de regex (`\\d`), que o
 * template literal converte para `\d` no script final. Nenhuma mudança de
 * comportamento: a suíte `lms-assets-mobile-stability.execution.test.ts`
 * executa o wrapper montado em jsdom e cobre esta montagem.
 */

/**
 * Helpers de localização SCORM em escopo de módulo do `<script>` (nomes
 * estáveis para sobreviver à minificação). Inclui `finiteNumberOrNull`
 * (preserva o zero numérico) e `resolveProbedScormLocation` (autoridade da
 * posição explícita do pacote sobre frações genéricas do DOM).
 */
export function buildScormLocationHelpersScript(): string {
  return `
/* ── SCORM location helpers (stable names, injected as literals to survive minification) ── */
function parseScormLocationMarker(location) {
  if (typeof location !== 'string' || !location.trim()) return null;
  var trimmed = location.trim();
  var match = trimmed.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
  if (!match) { match = trimmed.match(/(\\d+)\\s*of\\s*(\\d+)/i); }
  if (match) {
    var current = Number(match[1]);
    var total = Number(match[2]);
    if (!isFinite(current) || !isFinite(total) || total <= 0 || current < 0) return null;
    return { current: current, total: total };
  }
  var single = Number(trimmed);
  if (isFinite(single) && single > 0) return { current: single, total: null };
  return null;
}
function parseScormLocationPair(location) {
  var marker = parseScormLocationMarker(location);
  if (!marker || marker.total == null) return null;
  return { current: marker.current, total: marker.total };
}
function resolveScormResumeTargetSlide(savedLocation, observedLocation) {
  var saved = parseScormLocationMarker(savedLocation);
  if (!saved || saved.current <= 1) return null;
  var observed = parseScormLocationMarker(observedLocation);
  if (observed) {
    if (observed.current >= saved.current) return null;
    if (observed.total != null && saved.current > observed.total) return null;
  }
  return saved.current;
}
function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  var n = typeof value === 'number' ? value : parseFloat(String(value));
  return isFinite(n) ? n : null;
}
function resolveProbedScormLocation(authored, explicitLocation, domLocation) {
  var explicitMarker = parseScormLocationMarker(explicitLocation);
  if (authored && explicitMarker && explicitMarker.current >= 1) {
    return { location: String(explicitLocation), persist: false, reason: 'explicit-package-location' };
  }
  var domMarker = parseScormLocationMarker(domLocation);
  if (!domMarker) {
    return {
      location: explicitMarker ? String(explicitLocation) : null,
      persist: false,
      reason: 'no-dom-progress',
    };
  }
  var domLoc = domMarker.total == null
    ? String(domMarker.current)
    : String(domMarker.current) + '/' + String(domMarker.total);
  return { location: domLoc, persist: true, reason: 'dom-fallback' };
}`;
}

/**
 * Parsers de progresso a partir do DOM do frame do pacote. Puros: dependem
 * apenas dos argumentos (`text` / `doc`).
 */
export function buildScormProgressParsersScript(): string {
  return `
  function parseProgressFromText(text) {
    if (!text) return null;
    var regex = /(\\d+)\\s*\\/\\s*(\\d+)/g;
    var match;
    var best = null;
    while ((match = regex.exec(text)) !== null) {
      var current = Number(match[1]);
      var total = Number(match[2]);
      if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 1 || current < 0 || current > total) {
        continue;
      }
      var pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
      if (!best || total > best.total) {
        best = { current: current, total: total, pct: pct };
      }
    }

    if (best) return best;

    var ofRegex = /(\\d+)\\s*of\\s*(\\d+)/gi;
    while ((match = ofRegex.exec(text)) !== null) {
      var ofCurrent = Number(match[1]);
      var ofTotal = Number(match[2]);
      if (!Number.isFinite(ofCurrent) || !Number.isFinite(ofTotal) || ofTotal <= 1 || ofCurrent < 0 || ofCurrent > ofTotal) {
        continue;
      }
      var ofPct = Math.max(0, Math.min(100, Math.round((ofCurrent / ofTotal) * 100)));
      if (!best || ofTotal > best.total) {
        best = { current: ofCurrent, total: ofTotal, pct: ofPct };
      }
    }

    return best;
  }

  function parseProgressFromHeader(doc) {
    if (!doc) return null;

    var currentNode = doc.querySelector('#lesson-header-nav-page-number');
    var currentText = currentNode ? String(currentNode.textContent || '') : '';
    var currentMatch = currentText.match(/\\d+/);
    var current = currentMatch ? Number(currentMatch[0]) : NaN;

    var total = NaN;
    var menuCount = doc.querySelector('#lesson-menu-page-count');
    if (menuCount) {
      total = Number(menuCount.getAttribute('data-total') || '');
    }

    if (!Number.isFinite(total) || total <= 1) {
      var headerCount = doc.querySelector('#lesson-header-nav-page-count');
      var headerText = headerCount ? String(headerCount.textContent || '') : '';
      var slash = headerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
      if (slash) {
        if (!Number.isFinite(current)) current = Number(slash[1]);
        total = Number(slash[2]);
      }

      if (!Number.isFinite(total) || total <= 1) {
        var compactOf = headerText.match(/(\\d+)\\s*of\\s*(\\d+)/i);
        if (compactOf) {
          if (!Number.isFinite(current)) current = Number(compactOf[1]);
          total = Number(compactOf[2]);
        }
      }
    }

    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 1) return null;
    if (current < 0 || current > total) return null;

    return {
      current: current,
      total: total,
      pct: Math.max(0, Math.min(100, Math.round((current / total) * 100))),
    };
  }

  function parseProgressFromDocument(doc) {
    var fromHeader = parseProgressFromHeader(doc);
    if (fromHeader) return fromHeader;
    var text = (doc && doc.body && doc.body.innerText) ? doc.body.innerText : '';
    return parseProgressFromText(text);
  }`;
}

/**
 * Encerramento governado de sessão ("Sair do curso") + relay seguro do
 * diagnóstico bruto do pacote. Referencia o escopo do wrapper
 * (`commit`, `buildPayload`, `getScormLocation`, `postToParent`, `setStatus`,
 * `probeFrameProgress`, `MATRICULA_ID`, `IS_2004`, `apiInitialized`,
 * `sessionCloseHandled`, `autosaveTimer`, `interactionProbeTimer`) — por isso é
 * interpolado dentro da IIFE do wrapper.
 */
export function buildScormSessionCloseRuntimeScript(): string {
  return `
  // Governed "Sair do curso": React asks the wrapper to close the session
  // cleanly (flush + final commit + SCORM termination) and only navigates away
  // after the ACK or a bounded timeout. Idempotent; never fabricates
  // completion/status/score — the package remains the authority.
  var SESSION_CLOSE_TIMEOUT_MS = 4000;
  function performGovernedSessionClose(reason) {
    if (sessionCloseHandled) {
      postToParent({
        type: 'lms:session-close:ack',
        matriculaId: MATRICULA_ID,
        status: 'already-closed',
        reason: reason || null,
        location: getScormLocation(),
      });
      return;
    }
    sessionCloseHandled = true;

    if (autosaveTimer) { window.clearTimeout(autosaveTimer); autosaveTimer = null; }
    if (interactionProbeTimer) { window.clearTimeout(interactionProbeTimer); interactionProbeTimer = null; }

    try { probeFrameProgress(); } catch (_probeError) { /* frame DOM may be locked */ }

    var settled = false;
    var finish = function(status) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        if (apiInitialized) {
          if (IS_2004 && window.API_1484_11 && typeof window.API_1484_11.Terminate === 'function') {
            window.API_1484_11.Terminate('');
          } else if (!IS_2004 && window.API && typeof window.API.LMSFinish === 'function') {
            window.API.LMSFinish('');
          }
        }
      } catch (_terminateError) { /* termination best-effort */ }
      setStatus('Sessão encerrada', false);
      postToParent({
        type: 'lms:session-close:ack',
        matriculaId: MATRICULA_ID,
        status: status || 'closed',
        reason: reason || null,
        location: getScormLocation(),
      });
    };

    var timer = window.setTimeout(function() { finish('timeout'); }, SESSION_CLOSE_TIMEOUT_MS);

    try {
      Promise.resolve(commit(buildPayload(), 0, 'SCORM_FINISH')).then(
        function() { finish('closed'); },
        function() { finish('closed'); }
      );
    } catch (_commitError) {
      finish('closed');
    }
  }

  // Relay the inner SCORM package's raw completion diagnostics
  // (AIRTRUST_COMPLETION_DIAGNOSTICS_V1) up to React as lms:completion-diagnostics.
  // Trust ONLY the exact scorm-frame window as the source; ignore any IDs the
  // payload asserts — they are never used for auth/tenant/routing.
  var MAX_RELAYED_DIAGNOSTICS_CHARS = 64000;
  function relayPackageDiagnostics(event) {
    var frame = document.getElementById('scorm-frame');
    if (!frame || !frame.contentWindow || event.source !== frame.contentWindow) return false;
    var data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1') return false;
    var payload = data.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    var serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch (_serializeError) {
      return false;
    }
    if (typeof serialized !== 'string' || serialized.length > MAX_RELAYED_DIAGNOSTICS_CHARS) return false;
    postToParent({
      type: 'lms:completion-diagnostics',
      matriculaId: MATRICULA_ID,
      diagnostics: JSON.parse(serialized),
    });
    return true;
  }`;
}
