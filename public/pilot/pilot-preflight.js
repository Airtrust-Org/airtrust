const ONLINE_FLIGHT_LIST_SELECTOR = '#online-flights';
const DETAIL_CARD_SELECTOR = '#flight-detail-card';
const DETAIL_STATUS_SELECTOR = '#detail-status';
const CLOSE_DETAIL_BUTTON_SELECTOR = '#close-detail';
const LEASE_BUTTON_SELECTOR = '#prepare-edit-offline';
const OPEN_DRAFT_BUTTON_SELECTOR = '#open-local-draft';
const LEASE_STATUS_SELECTOR = '#lease-status';
const EDITOR_CARD_SELECTOR = '#rdv-editor-card';
const SESSION_STATUS_SELECTOR = '#session-status';
const PREFLIGHT_TIMEOUT_MS = 30000;

const PREPARE_LABELS = new Set([
  'Abrir voo',
  'Preparar este voo',
  'Preparar offline',
  'Preparar para voo',
  'Atualizar pacote',
  'Atualizar preparação',
]);

let preflightRun = 0;
let preflightRunning = false;

function isVisible(element) {
  return Boolean(element) && !element.classList.contains('hidden');
}

function setStatus(element, message, kind) {
  if (!element) return;
  element.className = 'statusline ' + kind;
  element.textContent = message;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitFor(predicate, message, timeoutMs = PREFLIGHT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(message);
}

function normalizePrepareLabels() {
  const container = document.querySelector(ONLINE_FLIGHT_LIST_SELECTOR);
  if (!container) return;
  for (const button of container.querySelectorAll('button')) {
    const label = button.textContent?.trim() || '';
    if (
      label === 'Preparar este voo' ||
      label === 'Preparar offline' ||
      label === 'Preparar para voo' ||
      label === 'Atualizar pacote' ||
      label === 'Atualizar preparação'
    ) {
      button.textContent = 'Abrir voo';
    }
  }
}

async function assertPilotShellReady() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker indisponível neste navegador.');
  }

  const registration = await navigator.serviceWorker.ready;
  if (new URL(registration.scope).pathname !== '/pilot/') {
    throw new Error('O Service Worker offline não está isolado no escopo /pilot/.');
  }

  const controller = await waitFor(
    () => navigator.serviceWorker.controller,
    'O shell offline ainda não assumiu o controle desta tela.',
    10000,
  );
  if (!new URL(controller.scriptURL).pathname.endsWith('/pilot/pilot-sw.js')) {
    throw new Error('A tela não está controlada pelo Service Worker do Pilot App.');
  }
}

function leaseLooksReady() {
  const leaseStatus = document.querySelector(LEASE_STATUS_SELECTOR);
  const text = leaseStatus?.textContent || '';
  return /Lease (?:verificado e salvo|válido neste tablet)/i.test(text);
}

async function ensureOperationalDraftOpen(runId) {
  await waitFor(
    () => {
      const sessionStatus = document.querySelector(SESSION_STATUS_SELECTOR);
      const leaseStatus = document.querySelector(LEASE_STATUS_SELECTOR);
      const editor = document.querySelector(EDITOR_CARD_SELECTOR);
      const sessionText = sessionStatus?.textContent?.trim() || '';
      if (sessionStatus?.classList.contains('error')) {
        throw new Error(sessionText || 'Falha ao abrir o voo.');
      }
      if (leaseStatus?.classList.contains('error')) {
        throw new Error(leaseStatus.textContent?.trim() || 'Falha ao preparar uso offline.');
      }
      return leaseLooksReady() && isVisible(editor) ? editor : null;
    },
    'O voo não ficou pronto para preenchimento offline neste tablet.',
  );
  if (runId !== preflightRun) return;
}

async function runCompleteOfflinePreflight(runId) {
  const sessionStatus = document.querySelector(SESSION_STATUS_SELECTOR);
  const detailStatus = document.querySelector(DETAIL_STATUS_SELECTOR);

  try {
    setStatus(
      sessionStatus,
      'Abrindo voo e preparando uso offline…',
      'attention',
    );

    await ensureOperationalDraftOpen(runId);
    if (runId !== preflightRun) return;
    await assertPilotShellReady();
    if (runId !== preflightRun) return;

    setStatus(
      detailStatus,
      'PRONTO PARA USO OFFLINE — pacote, lease e rascunho verificados neste tablet.',
      'ok',
    );
    setStatus(
      sessionStatus,
      'Voo pronto para uso offline. O preenchimento continuará disponível se a conexão cair.',
      'ok',
    );
  } catch (error) {
    if (runId !== preflightRun) return;
    const message = error instanceof Error ? error.message : 'Falha desconhecida no preflight offline.';
    setStatus(
      detailStatus,
      'NÃO PRONTO PARA USO OFFLINE — ' + message,
      'error',
    );
    setStatus(
      sessionStatus,
      'Não foi possível preparar este voo para uso offline: ' + message,
      'error',
    );
  } finally {
    if (runId === preflightRun) preflightRunning = false;
  }
}

function handlePrepareIntent(event) {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!target || !target.closest(ONLINE_FLIGHT_LIST_SELECTOR) || target.disabled) return;
  const label = target.textContent?.trim() || '';
  if (!PREPARE_LABELS.has(label)) return;

  if (preflightRunning) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const editor = document.querySelector(EDITOR_CARD_SELECTOR);
  if (isVisible(editor)) {
    event.preventDefault();
    event.stopPropagation();
    setStatus(
      document.querySelector(SESSION_STATUS_SELECTOR),
      'Feche o rascunho atual para concluir o salvamento local antes de preparar outro voo.',
      'error',
    );
    return;
  }

  const detailCard = document.querySelector(DETAIL_CARD_SELECTOR);
  if (isVisible(detailCard)) {
    const closeDetail = document.querySelector(CLOSE_DETAIL_BUTTON_SELECTOR);
    if (closeDetail instanceof HTMLButtonElement) closeDetail.click();
  }

  preflightRunning = true;
  preflightRun += 1;
  const runId = preflightRun;
  queueMicrotask(() => void runCompleteOfflinePreflight(runId));
}

document.addEventListener('click', handlePrepareIntent, true);

const labelObserver = new MutationObserver(normalizePrepareLabels);
const onlineFlights = document.querySelector(ONLINE_FLIGHT_LIST_SELECTOR);
if (onlineFlights) {
  labelObserver.observe(onlineFlights, { childList: true, subtree: true, characterData: true });
  normalizePrepareLabels();
}

window.addEventListener('offline', () => {
  const detailStatus = document.querySelector(DETAIL_STATUS_SELECTOR);
  const sessionStatus = document.querySelector(SESSION_STATUS_SELECTOR);
  if (detailStatus?.textContent?.startsWith('PRONTO PARA USO OFFLINE')) {
    setStatus(
      detailStatus,
      'OFFLINE — operação local ativa. Pacote, lease e rascunho permanecem disponíveis neste tablet.',
      'ok',
    );
    setStatus(
      sessionStatus,
      'OFFLINE — o voo continua disponível neste tablet.',
      'ok',
    );
  }
});
