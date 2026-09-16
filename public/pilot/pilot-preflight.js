const ONLINE_FLIGHT_LIST_SELECTOR = '#online-flights';
const DETAIL_CARD_SELECTOR = '#flight-detail-card';
const DETAIL_STATUS_SELECTOR = '#detail-status';
const LEASE_BUTTON_SELECTOR = '#prepare-edit-offline';
const OPEN_DRAFT_BUTTON_SELECTOR = '#open-local-draft';
const LEASE_STATUS_SELECTOR = '#lease-status';
const EDITOR_CARD_SELECTOR = '#rdv-editor-card';
const SESSION_STATUS_SELECTOR = '#session-status';
const PREFLIGHT_TIMEOUT_MS = 30000;

const PREPARE_LABELS = new Set([
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
    if (label === 'Preparar este voo' || label === 'Preparar offline') {
      button.textContent = 'Preparar para voo';
    } else if (label === 'Atualizar pacote') {
      button.textContent = 'Atualizar preparação';
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
  const detailCard = await waitFor(
    () => {
      const candidate = document.querySelector(DETAIL_CARD_SELECTOR);
      return isVisible(candidate) ? candidate : null;
    },
    'O pacote do voo não ficou disponível no tablet.',
  );
  if (runId !== preflightRun) return;

  const leaseButton = document.querySelector(LEASE_BUTTON_SELECTOR);
  const openDraftButton = document.querySelector(OPEN_DRAFT_BUTTON_SELECTOR);
  if (!leaseButton || !openDraftButton) {
    throw new Error('Controles de preparação offline não foram encontrados.');
  }

  if (leaseLooksReady() && !openDraftButton.disabled) {
    openDraftButton.click();
  } else {
    await waitFor(
      () => !leaseButton.disabled || leaseLooksReady(),
      'Não foi possível habilitar a emissão do lease offline.',
    );
    if (leaseLooksReady() && !openDraftButton.disabled) openDraftButton.click();
    else leaseButton.click();
  }

  await waitFor(
    () => {
      const leaseStatus = document.querySelector(LEASE_STATUS_SELECTOR);
      const editor = document.querySelector(EDITOR_CARD_SELECTOR);
      const failed = leaseStatus?.classList.contains('error');
      if (failed) {
        throw new Error(leaseStatus.textContent?.trim() || 'Falha ao preparar edição offline.');
      }
      return leaseLooksReady() && isVisible(editor);
    },
    'Pacote salvo, mas a edição offline não ficou pronta antes da perda de conectividade.',
  );

  if (!detailCard.isConnected) {
    throw new Error('O voo preparado deixou de estar ativo durante o preflight.');
  }
}

async function runCompleteOfflinePreflight(runId) {
  const sessionStatus = document.querySelector(SESSION_STATUS_SELECTOR);
  const detailStatus = document.querySelector(DETAIL_STATUS_SELECTOR);

  try {
    setStatus(
      sessionStatus,
      'Preparando voo: pacote, autorização offline, rascunho e shell local…',
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
      'PRONTO PARA USO OFFLINE. O piloto pode perder a conexão; alterações permanecem cifradas neste tablet até a sincronização.',
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
      'Preparação offline incompleta. Mantenha conexão e corrija antes do voo: ' + message,
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
  if (detailStatus?.textContent?.startsWith('PRONTO PARA USO OFFLINE')) {
    setStatus(
      detailStatus,
      'OFFLINE — operação local ativa. Pacote, lease e rascunho permanecem disponíveis neste tablet.',
      'ok',
    );
  }
});
