import { PilotVault } from '/pilot/pilot-vault.js';
import {
  hasTrustedPilotLeaseKeys,
  verifyPilotOfflineLease,
} from '/pilot/pilot-lease.js';
import { PILOT_OFFLINE_APP_VERSION } from '/pilot/pilot-lease-trust.js';
import {
  applySafeStageAggregates,
  assertPackageIdentity,
  assertVerifiedLeaseAllowsDraft,
  buildDraftSnapshot,
  calcConsumoCombustivel,
  calcHorasVoadas,
  parseNumber,
  validateRdvForm,
  validateStageDrafts,
} from '/pilot/pilot-rdv-draft.js';
import {
  buildOfflineSyncCommand,
  verifyOfflineSyncCommandHash,
} from '/pilot/pilot-sync.js';

const DRAFT_ID = 'phase1-synthetic-rdv-draft';
const SAVE_DELAY_MS = 180;
const TARGET_FLIGHT_ID = new URLSearchParams(window.location.search).get('flight');
const PRODUCTION_API_BASE_URL = 'https://api.airtrust.online/api';
const STAGING_API_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev/api';
const PRODUCTION_FRONTEND_HOSTS = new Set([
  'airtrust.online',
  'www.airtrust.online',
  'airtrust.pages.dev',
  'production.airtrust.pages.dev',
]);
const STAGING_FRONTEND_HOSTS = new Set([
  'staging.airtrust.pages.dev',
  'airtrust-staging.pages.dev',
]);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function resolvePilotApiBase() {
  const host = String(window.location.hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (LOCAL_HOSTS.has(host)) return window.location.origin.replace(/\/$/, '') + '/api';
  if (PRODUCTION_FRONTEND_HOSTS.has(host)) return PRODUCTION_API_BASE_URL;
  if (STAGING_FRONTEND_HOSTS.has(host)) return STAGING_API_BASE_URL;
  throw new Error('Host do Pilot App não autorizado para selecionar uma API AirTrust.');
}

const API_BASE_URL = resolvePilotApiBase();

const connectivity = document.querySelector('#connectivity');
const unlockCard = document.querySelector('#unlock-card');
const unlockTitle = document.querySelector('#unlock-title');
const unlockHelp = document.querySelector('#unlock-help');
const pinInput = document.querySelector('#pin');
const pinConfirmInput = document.querySelector('#pin-confirm');
const confirmWrap = document.querySelector('#confirm-wrap');
const unlockButton = document.querySelector('#unlock-button');
const unlockStatus = document.querySelector('#unlock-status');
const workspace = document.querySelector('#workspace');
const refreshOnlineButton = document.querySelector('#refresh-online');
const sessionStatus = document.querySelector('#session-status');
const cachedCount = document.querySelector('#cached-count');
const storageLabel = document.querySelector('#storage');
const cachedFlights = document.querySelector('#cached-flights');
const onlineFlights = document.querySelector('#online-flights');
const flightDetailCard = document.querySelector('#flight-detail-card');
const detailTitle = document.querySelector('#detail-title');
const detailSubtitle = document.querySelector('#detail-subtitle');
const detailStatus = document.querySelector('#detail-status');
const flightDetail = document.querySelector('#flight-detail');
const closeDetailButton = document.querySelector('#close-detail');
const draftInput = document.querySelector('#draft');
const saveStatus = document.querySelector('#save-status');
const revisionLabel = document.querySelector('#revision');
const lastSavedLabel = document.querySelector('#last-saved');
const saveNowButton = document.querySelector('#save-now');
const lockButton = document.querySelector('#lock');
const prepareEditOfflineButton = document.querySelector('#prepare-edit-offline');
const openLocalDraftButton = document.querySelector('#open-local-draft');
const leaseStatus = document.querySelector('#lease-status');
const rdvEditorCard = document.querySelector('#rdv-editor-card');
const rdvEditorTitle = document.querySelector('#rdv-editor-title');
const rdvEditorSubtitle = document.querySelector('#rdv-editor-subtitle');
const rdvEditorSaveStatus = document.querySelector('#rdv-editor-save-status');
const rdvLocalSequenceLabel = document.querySelector('#rdv-local-sequence');
const rdvLeaseUntilLabel = document.querySelector('#rdv-lease-until');
const rdvFormFields = document.querySelector('#rdv-form-fields');
const rdvStageFields = document.querySelector('#rdv-stage-fields');
const closeRdvEditorButton = document.querySelector('#close-rdv-editor');
const syncRdvButton = document.querySelector('#sync-rdv-now');
const rdvSyncStatus = document.querySelector('#rdv-sync-status');
const rdvServerSyncStatus = document.querySelector('#rdv-server-sync-status');
const refreshCanonicalPackageButton = document.querySelector('#refresh-canonical-package');
const finalizeRdvServerButton = document.querySelector('#finalize-rdv-server');
const sendRdvCoordinationButton = document.querySelector('#send-rdv-coordination');
const coordinationStatus = document.querySelector('#coordination-status');
const coordinationReceipt = document.querySelector('#coordination-receipt');

let vault;
let provisioned = false;
let localRevision = 0;
let saveTimer = null;
let saveChain = Promise.resolve();
let cachedPackageRecords = [];
let onlineFlightRecords = [];
let activePackageRecord = null;
let activeVerifiedLease = null;
let activeRdvDraft = null;
let activeStageDrafts = [];
let operationalLocalSequence = 0;
let operationalNextSequence = 0;
let operationalSaveTimer = null;
let operationalSaveChain = Promise.resolve();
let timingSequence = 0;
let operationalSyncInFlight = false;
let coordinationInFlight = false;

function setConnectivity() {
  const online = navigator.onLine;
  connectivity.className = 'pill ' + (online ? 'ok' : 'attention');
  connectivity.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'dot';
  const text = document.createElement('span');
  text.textContent = online ? 'ONLINE' : 'OFFLINE — operação local ativa';
  connectivity.append(dot, text);
  refreshOnlineButton.disabled = !online;
  if (activePackageRecord) void refreshCoordinationControls();
}

function formatTimestamp(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return String(value);
  }
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const parsed = new Date(String(value).includes('T') ? value : value + 'T12:00:00');
    return parsed.toLocaleDateString('pt-BR');
  } catch {
    return String(value);
  }
}

function displayText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function airportLabel(airport, fallbackId) {
  if (!airport) return fallbackId ? 'ID ' + fallbackId : '—';
  return (
    airport.codigo_icao ||
    airport.codigo ||
    airport.nome ||
    (fallbackId ? 'ID ' + fallbackId : '—')
  );
}

async function updateStorageEstimate() {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
    storageLabel.textContent = 'Estimativa indisponível';
    return;
  }
  const estimate = await navigator.storage.estimate();
  const usage = Number(estimate.usage || 0);
  const quota = Number(estimate.quota || 0);
  if (!quota) {
    storageLabel.textContent = 'Quota indisponível';
    return;
  }
  storageLabel.textContent =
    Math.round((usage / 1024 / 1024) * 10) / 10 +
    ' MB usados de ' +
    Math.round(quota / 1024 / 1024) +
    ' MB';
}

async function requestPersistentStorage() {
  if (navigator.storage && typeof navigator.storage.persist === 'function') {
    try {
      await navigator.storage.persist();
    } catch {
      // A UI nunca transforma esta tentativa em garantia de persistência.
    }
  }
}

async function registerPilotServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/pilot/pilot-sw.js', {
      scope: '/pilot/',
      updateViaCache: 'none',
    });
  } catch (error) {
    console.warn('[Pilot Offline] Falha ao registrar Service Worker isolado:', error);
  }
}

function readCurrentAccessToken() {
  // Token é usado apenas em memória para chamadas online. Nunca entra no vault.
  try {
    const localToken = window.localStorage?.getItem('airtrust_token');
    if (localToken) return localToken;
  } catch {
    // Storage pode ser bloqueado pelo navegador; tentamos a sessão abaixo.
  }
  try {
    return window.sessionStorage?.getItem('airtrust_token') || null;
  } catch {
    return null;
  }
}

class PilotOnlineRequestError extends Error {
  constructor(message, status = 0, code = null) {
    super(message);
    this.name = 'PilotOnlineRequestError';
    this.status = status;
    this.code = code;
  }
}

async function authenticatedGet(path) {
  if (!navigator.onLine) {
    throw new PilotOnlineRequestError('Sem conexão. Use um pacote já armazenado no tablet.');
  }

  const token = readCurrentAccessToken();
  if (!token) {
    throw new PilotOnlineRequestError(
      'Sessão online não disponível. Entre no AirTrust e retorne ao Pilot App.',
      401,
      'MISSING_LOCAL_SESSION',
    );
  }

  const response = await fetch(API_BASE_URL + path, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PilotOnlineRequestError(
      body?.error || body?.message || 'Falha ao consultar o AirTrust.',
      response.status,
      body?.code || null,
    );
  }
  return body;
}

async function authenticatedPost(path, payload) {
  if (!navigator.onLine) {
    throw new PilotOnlineRequestError('Sem conexão. Esta operação online não pode ser executada.');
  }

  const token = readCurrentAccessToken();
  if (!token) {
    throw new PilotOnlineRequestError(
      'Sessão online não disponível. Entre no AirTrust e retorne ao Pilot App.',
      401,
      'MISSING_LOCAL_SESSION',
    );
  }

  const response = await fetch(API_BASE_URL + path, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PilotOnlineRequestError(
      body?.error || body?.message || 'Falha na operação online do Pilot App.',
      response.status,
      body?.code || null,
    );
  }
  return body;
}

function containsForbiddenPackageKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsForbiddenPackageKey);

  for (const [key, nested] of Object.entries(value)) {
    if (/^(authorization|access_token|refresh_token|airtrust_token|anexo_r2_key)$/i.test(key)) {
      return true;
    }
    if (containsForbiddenPackageKey(nested)) return true;
  }
  return false;
}

function validateOfflinePackage(packageData, expectedFlightId) {
  if (!packageData || typeof packageData !== 'object') {
    throw new Error('Pacote offline inválido: resposta vazia.');
  }
  const contract = packageData.contract;
  if (
    contract?.name !== 'airtrust-pilot-offline-package' ||
    Number(contract?.version) !== 1 ||
    contract?.read_only !== true ||
    typeof contract?.sync_supported !== 'boolean' ||
    contract?.regulated_edb !== false
  ) {
    throw new Error('Pacote offline incompatível com esta versão do Pilot App.');
  }
  if (Number(packageData.voo?.id) !== Number(expectedFlightId)) {
    throw new Error('Pacote offline não corresponde ao voo solicitado.');
  }
  if (!contract.package_id || typeof contract.package_id !== 'string') {
    throw new Error('Pacote offline sem identificador de versão.');
  }
  if (containsForbiddenPackageKey(packageData)) {
    throw new Error('Pacote offline contém campo interno não permitido.');
  }
}

function setSessionMessage(message, kind = 'attention', offerLogin = false) {
  sessionStatus.className = 'statusline ' + kind;
  sessionStatus.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  sessionStatus.append(text);
  if (offerLogin) {
    const link = document.createElement('a');
    link.className = 'signin-link';
    link.href = '/login';
    link.textContent = 'Entrar no AirTrust';
    sessionStatus.append(link);
  }
}

function makeFlightItem({ title, subtitle, badge, buttonText, onClick, disabled = false }) {
  const item = document.createElement('div');
  item.className = 'flight-item';

  const copy = document.createElement('div');
  const titleEl = document.createElement('div');
  titleEl.className = 'flight-title';
  titleEl.textContent = title;
  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'flight-subtitle';
  subtitleEl.textContent = subtitle;
  copy.append(titleEl, subtitleEl);

  if (badge) {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'badge';
    badgeEl.textContent = badge;
    copy.append(badgeEl);
  }

  const button = document.createElement('button');
  button.className = 'primary';
  button.type = 'button';
  button.textContent = buttonText;
  button.disabled = disabled;
  button.addEventListener('click', onClick);

  item.append(copy, button);
  return item;
}

function renderEmpty(container, message) {
  container.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.className = 'muted';
  paragraph.textContent = message;
  container.append(paragraph);
}

function packageRecordFlightId(record) {
  return Number(record?.value?.package?.voo?.id || 0);
}

function renderCachedPackages() {
  cachedCount.textContent = String(cachedPackageRecords.length);
  if (cachedPackageRecords.length === 0) {
    renderEmpty(cachedFlights, 'Nenhum pacote de voo armazenado neste tablet.');
    return;
  }

  cachedFlights.replaceChildren();
  for (const record of cachedPackageRecords) {
    const packageData = record.value.package;
    const voo = packageData.voo;
    const route =
      airportLabel(packageData.origem, voo.origem_id) +
      ' → ' +
      airportLabel(packageData.destino, voo.destino_id);
    cachedFlights.append(
      makeFlightItem({
        title: displayText(voo.prefixo, 'Voo #' + voo.id),
        subtitle: formatDate(voo.data_programacao) + ' · ' + route,
        badge: 'Consulta offline disponível · salvo ' + formatTimestamp(record.value.prepared_at),
        buttonText: 'Abrir',
        onClick: () => openPackageRecord(record),
      }),
    );
  }
}

function renderOnlineFlights() {
  if (!navigator.onLine) {
    renderEmpty(onlineFlights, 'Sem conexão. A lista online não é atualizada em modo offline.');
    return;
  }
  if (onlineFlightRecords.length === 0) {
    renderEmpty(onlineFlights, 'Nenhum voo autorizado foi retornado para a sessão atual.');
    return;
  }

  const sorted = [...onlineFlightRecords].sort((a, b) => {
    if (String(a.id) === String(TARGET_FLIGHT_ID)) return -1;
    if (String(b.id) === String(TARGET_FLIGHT_ID)) return 1;
    return String(b.data_programacao || '').localeCompare(String(a.data_programacao || ''));
  });

  onlineFlights.replaceChildren();
  for (const voo of sorted) {
    const cached = cachedPackageRecords.some((record) => packageRecordFlightId(record) === Number(voo.id));
    const targeted = String(voo.id) === String(TARGET_FLIGHT_ID);
    onlineFlights.append(
      makeFlightItem({
        title: displayText(voo.prefixo, 'Voo #' + voo.id),
        subtitle:
          formatDate(voo.data_programacao) +
          ' · status ' +
          displayText(voo.status, 'não informado') +
          ' · voo #' +
          voo.id,
        badge: cached ? 'Já existe pacote local' : targeted ? 'Voo solicitado' : null,
        buttonText: targeted ? 'Preparar este voo' : cached ? 'Atualizar pacote' : 'Preparar offline',
        disabled: !navigator.onLine,
        onClick: () => prepareFlightPackage(voo.id),
      }),
    );
  }
}

async function loadCachedPackages() {
  cachedPackageRecords = await vault.listJson('flight_packages');
  cachedPackageRecords.sort((a, b) =>
    String(b.value?.prepared_at || b.updatedAt || '').localeCompare(
      String(a.value?.prepared_at || a.updatedAt || ''),
    ),
  );
  renderCachedPackages();
  renderOnlineFlights();
}

async function loadOnlineFlights() {
  if (!vault?.isUnlocked()) return;
  if (!navigator.onLine) {
    setSessionMessage('Offline — mostrando apenas pacotes cifrados já armazenados.', 'attention');
    onlineFlightRecords = [];
    renderOnlineFlights();
    return;
  }

  refreshOnlineButton.disabled = true;
  setSessionMessage('Consultando voos autorizados…', 'attention');
  try {
    const body = await authenticatedGet('/controle-voos/voos/meus');
    onlineFlightRecords = Array.isArray(body?.data) ? body.data : [];
    setSessionMessage(
      onlineFlightRecords.length > 0
        ? 'Sessão online válida. Selecione um voo para preparar a consulta offline.'
        : 'Sessão online válida, mas nenhum voo autorizado foi encontrado.',
      'ok',
    );
    renderOnlineFlights();
  } catch (error) {
    onlineFlightRecords = [];
    const authFailure = error instanceof PilotOnlineRequestError && error.status === 401;
    setSessionMessage(
      error instanceof Error ? error.message : 'Falha ao consultar voos.',
      'error',
      authFailure,
    );
    renderOnlineFlights();
  } finally {
    refreshOnlineButton.disabled = !navigator.onLine;
  }
}

async function prepareFlightPackage(flightId) {
  if (!vault?.isUnlocked()) return;
  setSessionMessage('Baixando e verificando pacote do voo #' + flightId + '…', 'attention');
  refreshOnlineButton.disabled = true;

  try {
    const body = await authenticatedGet(
      '/controle-voos/voos/' + encodeURIComponent(String(flightId)) + '/offline-package',
    );
    const packageData = body?.data;
    validateOfflinePackage(packageData, flightId);

    const recordId = 'flight:' + flightId;
    const existing = await vault.getJson('flight_packages', recordId);
    const nextRevision = Number(existing?.localRevision || 0) + 1;
    const preparedAt = new Date().toISOString();

    await vault.putJson(
      'flight_packages',
      recordId,
      {
        schema_version: 1,
        prepared_at: preparedAt,
        package: packageData,
      },
      nextRevision,
    );

    // Read-after-write: só confirma disponibilidade offline depois que o
    // conteúdo cifrado pode ser lido novamente do IndexedDB.
    const persisted = await vault.getJson('flight_packages', recordId);
    if (
      !persisted ||
      persisted.value?.package?.contract?.package_id !== packageData.contract.package_id ||
      Number(persisted.value?.package?.voo?.id) !== Number(flightId)
    ) {
      throw new Error('Falha na verificação local do pacote recém-gravado.');
    }

    setSessionMessage(
      'Pacote verificado e armazenado no tablet. Consulta offline disponível.',
      'ok',
    );
    await loadCachedPackages();
    openPackageRecord(persisted);
    await updateStorageEstimate();
  } catch (error) {
    const authFailure = error instanceof PilotOnlineRequestError && error.status === 401;
    setSessionMessage(
      error instanceof Error ? error.message : 'Falha ao preparar pacote offline.',
      'error',
      authFailure,
    );
  } finally {
    refreshOnlineButton.disabled = !navigator.onLine;
  }
}

function setLeaseMessage(message, kind = 'attention') {
  leaseStatus.className = 'statusline ' + kind;
  leaseStatus.textContent = message;
}

function activePackageData() {
  return activePackageRecord?.value?.package || null;
}

function offlineLeaseRecordId(flightId) {
  return 'flight:' + String(flightId) + ':lease';
}

function rdvDraftRecordId(flightId) {
  return 'flight:' + String(flightId) + ':rdv';
}

function outboxRecordId(operationId) {
  return 'operation:' + String(operationId);
}

function syncReceiptRecordId(operationId) {
  return 'operation:' + String(operationId);
}

function workflowReceiptRecordId(flightId, action, expectedVersion) {
  return (
    'flight:' +
    String(flightId) +
    ':workflow:' +
    String(action) +
    ':v' +
    String(expectedVersion)
  );
}

function setCoordinationMessage(message, kind = 'attention') {
  coordinationStatus.className = 'statusline ' + kind;
  coordinationStatus.textContent = message;
}

function setCoordinationReceipt(message) {
  if (!message) {
    coordinationReceipt.textContent = '';
    coordinationReceipt.classList.add('hidden');
    return;
  }
  coordinationReceipt.className = 'statusline ok';
  coordinationReceipt.textContent = message;
}

async function latestAcceptedSyncReceiptForFlight(flightId) {
  if (!vault?.isUnlocked()) return null;
  const records = await vault.listJson('sync_receipts');
  return (
    records
      .filter(
        (record) =>
          Number(record.value?.command_identity?.flight_id) === Number(flightId) &&
          ['accepted', 'already_accepted'].includes(record.value?.server_result?.status),
      )
      .sort((left, right) =>
        String(right.value?.received_at_local || right.updatedAt || '').localeCompare(
          String(left.value?.received_at_local || left.updatedAt || ''),
        ),
      )[0] || null
  );
}

async function latestConflictForFlight(flightId) {
  if (!vault?.isUnlocked()) return null;
  const records = await vault.listJson('conflicts');
  return (
    records
      .filter(
        (record) =>
          Number(record.value?.command_identity?.flight_id) === Number(flightId) ||
          Number(record.value?.flight_id) === Number(flightId),
      )
      .sort((left, right) =>
        String(
          right.value?.received_at_local ||
            right.value?.created_at ||
            right.updatedAt ||
            '',
        ).localeCompare(
          String(
            left.value?.received_at_local ||
              left.value?.created_at ||
              left.updatedAt ||
              '',
          ),
        ),
      )[0] || null
  );
}

async function latestWorkflowReceiptForFlight(flightId, action = null) {
  if (!vault?.isUnlocked()) return null;
  const records = await vault.listJson('workflow_receipts');
  return (
    records
      .filter(
        (record) =>
          Number(record.value?.flight_id) === Number(flightId) &&
          (!action || record.value?.action === action),
      )
      .sort((left, right) =>
        String(right.value?.updated_at_local || right.updatedAt || '').localeCompare(
          String(left.value?.updated_at_local || left.updatedAt || ''),
        ),
      )[0] || null
  );
}

async function persistWorkflowReceipt({
  flightId,
  action,
  expectedVersion,
  state,
  serverResult = null,
  error = null,
}) {
  const id = workflowReceiptRecordId(flightId, action, expectedVersion);
  const existing = await vault.getJson('workflow_receipts', id);
  const nextRevision = Number(existing?.localRevision || 0) + 1;
  await vault.putJson(
    'workflow_receipts',
    id,
    {
      schema_version: 1,
      flight_id: Number(flightId),
      action,
      expected_version: Number(expectedVersion),
      state,
      server_result: serverResult ? structuredClone(serverResult) : null,
      error: error
        ? {
            code: error instanceof PilotOnlineRequestError ? error.code : null,
            status: error instanceof PilotOnlineRequestError ? error.status : null,
            message: error instanceof Error ? error.message : String(error),
          }
        : null,
      updated_at_local: new Date().toISOString(),
    },
    nextRevision,
  );
  return vault.getJson('workflow_receipts', id);
}

async function getCoordinationState() {
  const packageData = activePackageData();
  if (!packageData || !vault?.isUnlocked()) {
    return {
      packageData,
      flightId: 0,
      rdv: null,
      canFinalize: false,
      canSend: false,
      reason: 'Abra um pacote de voo.',
    };
  }

  const flightId = Number(packageData.voo?.id || 0);
  const rdv = packageData.rdv || null;
  const unresolved = await listOutboxForFlight(flightId);
  if (unresolved.length > 0) {
    return {
      packageData,
      flightId,
      rdv,
      canFinalize: false,
      canSend: false,
      reason: 'Há uma transmissão offline pendente ou bloqueada. Resolva-a antes do fechamento.',
    };
  }

  const [latestSync, latestConflict] = await Promise.all([
    latestAcceptedSyncReceiptForFlight(flightId),
    latestConflictForFlight(flightId),
  ]);
  const syncTime = String(latestSync?.value?.received_at_local || '');
  const conflictTime = String(
    latestConflict?.value?.received_at_local ||
      latestConflict?.value?.created_at ||
      latestConflict?.updatedAt ||
      '',
  );
  if (latestConflict && (!syncTime || conflictTime > syncTime)) {
    return {
      packageData,
      flightId,
      rdv,
      canFinalize: false,
      canSend: false,
      reason: 'Existe conflito local mais recente que o último receipt aceito.',
    };
  }

  const packageMatchesAcceptedSync =
    Boolean(rdv && latestSync) &&
    Number(rdv.versao) === Number(latestSync.value?.server_result?.server_entity_version);

  const editableWorkflow = ['rascunho', 'devolvido', 'reaberto'].includes(
    String(rdv?.workflow_status || ''),
  );
  const sendableWorkflow = ['rascunho', 'devolvido'].includes(
    String(rdv?.workflow_status || ''),
  );

  return {
    packageData,
    flightId,
    rdv,
    latestSync,
    packageMatchesAcceptedSync,
    canFinalize:
      navigator.onLine &&
      !coordinationInFlight &&
      Boolean(rdv) &&
      rdv.status === 'rascunho' &&
      editableWorkflow &&
      packageMatchesAcceptedSync,
    canSend:
      navigator.onLine &&
      !coordinationInFlight &&
      Boolean(rdv) &&
      rdv.status === 'preenchimento_finalizado' &&
      sendableWorkflow,
    reason: null,
  };
}

async function refreshCoordinationControls() {
  refreshCanonicalPackageButton.disabled =
    !navigator.onLine || !vault?.isUnlocked() || !activePackageRecord || coordinationInFlight;
  finalizeRdvServerButton.disabled = true;
  sendRdvCoordinationButton.disabled = true;
  setCoordinationReceipt('');

  if (!activePackageRecord || !vault?.isUnlocked()) {
    setCoordinationMessage('Abra um pacote de voo para avaliar o fechamento.', 'attention');
    return;
  }

  const state = await getCoordinationState();
  const rdv = state.rdv;
  if (!rdv) {
    setCoordinationMessage(
      'O pacote canônico ainda não contém RDV. Transmita o rascunho e atualize do servidor.',
      'attention',
    );
    return;
  }

  if (rdv.workflow_status === 'enviado') {
    const localReceipt = await latestWorkflowReceiptForFlight(state.flightId, 'send_coordination');
    const confirmedAt =
      rdv.enviado_em ||
      localReceipt?.value?.server_result?.enviado_em ||
      localReceipt?.value?.updated_at_local ||
      null;
    setCoordinationMessage('RDV recebido pela Coordenação.', 'ok');
    setCoordinationReceipt(
      'Recebimento confirmado pelo servidor' +
        (confirmedAt ? ' em ' + formatTimestamp(confirmedAt) : '') +
        ' · versão ' +
        displayText(rdv.versao) +
        '.',
    );
    return;
  }

  if (state.reason) {
    setCoordinationMessage(state.reason, 'error');
    return;
  }

  finalizeRdvServerButton.disabled = !state.canFinalize;
  sendRdvCoordinationButton.disabled = !state.canSend;

  if (state.canFinalize) {
    setCoordinationMessage(
      'Dados transmitidos e pacote reconciliado. Revise e finalize o preenchimento quando estiver pronto.',
      'ok',
    );
  } else if (state.canSend) {
    setCoordinationMessage(
      'Preenchimento finalizado no servidor. O envio à Coordenação é uma ação separada e deliberada.',
      'ok',
    );
  } else if (
    rdv.status === 'rascunho' &&
    !state.packageMatchesAcceptedSync
  ) {
    setCoordinationMessage(
      'Atualize o pacote após o último receipt de transmissão antes de finalizar.',
      'attention',
    );
  } else {
    setCoordinationMessage(
      'Estado atual: ' +
        displayText(rdv.status) +
        ' · fluxo ' +
        displayText(rdv.workflow_status) +
        '.',
      'attention',
    );
  }
}

function setRdvSyncMessage(message, kind = 'attention') {
  rdvSyncStatus.className = 'statusline ' + kind;
  rdvSyncStatus.textContent = message;
}

function setServerSyncStatus(message) {
  rdvServerSyncStatus.textContent = message;
}

function updateSyncButtonState() {
  syncRdvButton.disabled =
    !navigator.onLine ||
    !vault?.isUnlocked() ||
    !activeRdvDraft ||
    !activeVerifiedLease ||
    activePackageData()?.contract?.sync_supported !== true ||
    operationalSyncInFlight;
}

async function listOutboxForFlight(flightId) {
  const records = await vault.listJson('outbox');
  return records
    .filter(
      (record) =>
        Number(record.value?.command?.flight_id) === Number(flightId) &&
        ['pending', 'blocked'].includes(record.value?.status),
    )
    .sort((left, right) =>
      String(left.value?.created_at || left.updatedAt || '').localeCompare(
        String(right.value?.created_at || right.updatedAt || ''),
      ),
    );
}

async function hasStoredConflictForFlight(flightId) {
  const conflicts = await vault.listJson('conflicts');
  return conflicts.some(
    (record) =>
      Number(record.value?.command_identity?.flight_id) === Number(flightId) ||
      Number(record.value?.flight_id) === Number(flightId),
  );
}

async function refreshOutboxStatusForActiveFlight() {
  const packageData = activePackageData();
  if (!packageData || !vault?.isUnlocked()) {
    setServerSyncStatus('Não sincronizado');
    updateSyncButtonState();
    return;
  }
  const flightId = Number(packageData.voo?.id || 0);
  const unresolved = await listOutboxForFlight(flightId);
  const blocked = unresolved.filter((record) => record.value?.status === 'blocked');
  const pending = unresolved.filter((record) => record.value?.status === 'pending');

  if (blocked.length > 0) {
    setServerSyncStatus('Ação necessária');
    setRdvSyncMessage(
      'Existe uma transmissão bloqueada. Os dados locais foram preservados para revisão.',
      'error',
    );
  } else if (pending.length > 0) {
    setServerSyncStatus('Pendente de transmissão');
    setRdvSyncMessage(
      navigator.onLine
        ? 'Existe uma transmissão pendente. O Pilot App tentará reenviar de forma idempotente.'
        : 'Transmissão pendente preservada na outbox cifrada até a conexão voltar.',
      'attention',
    );
  } else if (activeRdvDraft?.sync_state === 'accepted_requires_refresh') {
    setServerSyncStatus('Transmitido');
    setRdvSyncMessage(
      'Receipt confirmado. Atualize o pacote do voo antes de iniciar nova edição.',
      'ok',
    );
  } else if (await hasStoredConflictForFlight(flightId)) {
    setServerSyncStatus('Conflito');
    setRdvSyncMessage(
      'O servidor divergiu do pacote baixado. O rascunho local continua preservado.',
      'error',
    );
  } else {
    setServerSyncStatus('Não sincronizado');
    setRdvSyncMessage(
      navigator.onLine
        ? 'Rascunho salvo localmente. Transmita quando o preenchimento estiver pronto para o servidor.'
        : 'Rascunho salvo localmente. Reconecte para transmitir.',
      'attention',
    );
  }
  updateSyncButtonState();
}

async function verifyStoredLeaseForPackage(packageData) {
  if (!hasTrustedPilotLeaseKeys()) {
    throw new Error('Chave pública confiável do lease ainda não foi provisionada neste build.');
  }
  const identity = assertPackageIdentity(packageData);
  const deviceId = await vault.getOrCreateDeviceId();
  const stored = await vault.getJson('offline_leases', offlineLeaseRecordId(identity.flightId));
  if (!stored?.value?.envelope) return null;

  const verified = await verifyPilotOfflineLease(stored.value.envelope, {
    tenantId: identity.tenantId,
    userId: identity.userId,
    flightId: identity.flightId,
    deviceId,
  });
  return { verified, stored };
}

async function refreshLeaseControls(record) {
  activePackageRecord = record;
  activeVerifiedLease = null;
  closeOperationalEditor();

  if (!record) {
    prepareEditOfflineButton.disabled = true;
    openLocalDraftButton.disabled = true;
    setLeaseMessage('Abra um pacote de voo para avaliar o lease offline.', 'attention');
    return;
  }

  if (!hasTrustedPilotLeaseKeys()) {
    prepareEditOfflineButton.disabled = true;
    openLocalDraftButton.disabled = true;
    setLeaseMessage(
      'Edição bloqueada: chave pública confiável do lease ainda não foi provisionada neste build.',
      'attention',
    );
    return;
  }

  prepareEditOfflineButton.disabled = !navigator.onLine;
  openLocalDraftButton.disabled = true;
  try {
    const existing = await verifyStoredLeaseForPackage(record.value.package);
    if (existing?.verified) {
      activeVerifiedLease = existing.verified;
      openLocalDraftButton.disabled = false;
      setLeaseMessage(
        'Lease válido neste tablet até ' + formatTimestamp(existing.verified.claims.valid_until) + '.',
        'ok',
      );
      return;
    }
    setLeaseMessage(
      navigator.onLine
        ? 'Nenhum lease válido armazenado. Prepare a edição offline antes do voo.'
        : 'Sem lease válido local. Reconecte antes do voo para preparar a edição.',
      'attention',
    );
  } catch (error) {
    setLeaseMessage(error instanceof Error ? error.message : 'Lease local inválido.', 'error');
  }
}

async function prepareOfflineEditing() {
  const packageData = activePackageData();
  if (!packageData) return;

  if (!hasTrustedPilotLeaseKeys()) {
    setLeaseMessage(
      'Edição bloqueada: chave pública confiável do lease ainda não foi provisionada.',
      'error',
    );
    return;
  }

  prepareEditOfflineButton.disabled = true;
  setLeaseMessage('Solicitando e verificando lease offline…', 'attention');

  try {
    const identity = assertPackageIdentity(packageData);
    const deviceId = await vault.getOrCreateDeviceId();
    const body = await authenticatedPost(
      '/controle-voos/voos/' + encodeURIComponent(String(identity.flightId)) + '/offline-lease',
      {
        device_id: deviceId,
        app_version: PILOT_OFFLINE_APP_VERSION,
      },
    );
    const envelope = body?.data?.lease;
    const verified = await verifyPilotOfflineLease(envelope, {
      tenantId: identity.tenantId,
      userId: identity.userId,
      flightId: identity.flightId,
      deviceId,
    });

    const recordId = offlineLeaseRecordId(identity.flightId);
    const previous = await vault.getJson('offline_leases', recordId);
    const revision = Number(previous?.localRevision || 0) + 1;
    await vault.putJson(
      'offline_leases',
      recordId,
      {
        schema_version: 1,
        envelope,
        verified_at: verified.verified_at,
        claims: verified.claims,
      },
      revision,
    );

    const persisted = await vault.getJson('offline_leases', recordId);
    if (!persisted?.value?.envelope) {
      throw new Error('Lease assinado não foi persistido no tablet.');
    }
    const readBack = await verifyPilotOfflineLease(persisted.value.envelope, {
      tenantId: identity.tenantId,
      userId: identity.userId,
      flightId: identity.flightId,
      deviceId,
    });

    activeVerifiedLease = readBack;
    openLocalDraftButton.disabled = false;
    setLeaseMessage(
      'Lease verificado e salvo no tablet até ' + formatTimestamp(readBack.claims.valid_until) + '.',
      'ok',
    );
    await openOrSeedOperationalDraft(packageData, readBack);
  } catch (error) {
    const authFailure = error instanceof PilotOnlineRequestError && error.status === 401;
    setLeaseMessage(
      error instanceof Error ? error.message : 'Falha ao preparar edição offline.',
      'error',
    );
    if (authFailure) setSessionMessage('Sessão online necessária para emitir lease.', 'error', true);
  } finally {
    prepareEditOfflineButton.disabled = !navigator.onLine || !hasTrustedPilotLeaseKeys();
  }
}

async function openExistingOperationalDraft() {
  const packageData = activePackageData();
  if (!packageData) return;

  try {
    const existing = await verifyStoredLeaseForPackage(packageData);
    if (!existing?.verified) {
      throw new Error('Nenhum lease offline válido encontrado neste tablet.');
    }
    activeVerifiedLease = existing.verified;
    await openOrSeedOperationalDraft(packageData, existing.verified);
  } catch (error) {
    setLeaseMessage(
      error instanceof Error ? error.message : 'Não foi possível abrir o rascunho local.',
      'error',
    );
  }
}

async function openOrSeedOperationalDraft(packageData, verifiedLease) {
  assertVerifiedLeaseAllowsDraft(packageData, verifiedLease);
  const identity = assertPackageIdentity(packageData);
  const rdvId = rdvDraftRecordId(identity.flightId);
  const existingRdv = await vault.getJson('rdv_drafts', rdvId);
  const stageRecords = (await vault.listJson('stage_drafts')).filter(
    (record) => Number(record.value?.flight_id) === identity.flightId,
  );

  if (existingRdv) {
    const value = existingRdv.value;
    if (
      Number(value.tenant_id) !== identity.tenantId ||
      Number(value.user_id) !== identity.userId ||
      Number(value.flight_id) !== identity.flightId
    ) {
      throw new Error('Rascunho local pertence a outra identidade operacional.');
    }
    if (value.sync_state === 'accepted_requires_refresh') {
      throw new Error(
        'Este rascunho já foi transmitido. Atualize o pacote do voo antes de iniciar nova edição.',
      );
    }
    if (String(value.source_package_id) !== identity.packageId) {
      throw new Error(
        'O pacote do voo mudou desde o início deste rascunho. Resolução de conflito ainda não está habilitada.',
      );
    }
    const matchingStages = stageRecords
      .filter((record) => String(record.value?.source_package_id) === identity.packageId)
      .sort(
        (left, right) =>
          Number(left.value?.fields?.numero_etapa || 0) -
          Number(right.value?.fields?.numero_etapa || 0),
      );
    if (matchingStages.length === 0) {
      throw new Error('Rascunho local incompleto: etapas não encontradas.');
    }

    activeRdvDraft = value;
    activeStageDrafts = matchingStages.map((record) => record.value);
    operationalLocalSequence = Math.max(
      Number(existingRdv.localRevision || value.local_sequence || 0),
      ...matchingStages.map((record) =>
        Number(record.localRevision || record.value?.local_sequence || 0),
      ),
    );
    operationalNextSequence = operationalLocalSequence;
  } else {
    const snapshot = buildDraftSnapshot(packageData, 0);
    await vault.putJsonBatch([
      {
        storeName: 'rdv_drafts',
        id: snapshot.rdv.entity_local_id,
        value: snapshot.rdv,
        localRevision: 0,
      },
      ...snapshot.stages.map((stage) => ({
        storeName: 'stage_drafts',
        id: stage.entity_local_id,
        value: stage,
        localRevision: 0,
      })),
    ]);
    const persistedRdv = await vault.getJson('rdv_drafts', snapshot.rdv.entity_local_id);
    if (!persistedRdv) throw new Error('Falha ao criar rascunho RDV no tablet.');

    activeRdvDraft = persistedRdv.value;
    const persistedStages = (await vault.listJson('stage_drafts'))
      .filter(
        (record) =>
          Number(record.value?.flight_id) === identity.flightId &&
          String(record.value?.source_package_id) === identity.packageId,
      )
      .sort(
        (left, right) =>
          Number(left.value?.fields?.numero_etapa || 0) -
          Number(right.value?.fields?.numero_etapa || 0),
      );
    activeStageDrafts = persistedStages.map((record) => record.value);
    operationalLocalSequence = 0;
    operationalNextSequence = 0;
  }

  renderOperationalEditor();
  void refreshOutboxStatusForActiveFlight();
}

function localDateTimeNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function nextOperationalSequence() {
  operationalNextSequence += 1;
  return operationalNextSequence;
}

function markOperationalPending() {
  rdvEditorSaveStatus.className = 'statusline attention';
  rdvEditorSaveStatus.textContent = 'Alterações locais pendentes…';
}

function refreshDraftValidationPresentation() {
  const packageData = activePackageData();
  if (!activeRdvDraft || !packageData) return;
  const rdvErrors = validateRdvForm(activeRdvDraft.form, packageData);
  const stageErrors = validateStageDrafts(activeStageDrafts);
  const total = Object.keys(rdvErrors).length + stageErrors.length;

  const existing = rdvEditorCard.querySelector('#rdv-validation-summary');
  if (existing) existing.remove();

  if (total === 0) return;
  const summary = document.createElement('div');
  summary.id = 'rdv-validation-summary';
  summary.className = 'statusline error';
  summary.textContent =
    total + ' validação(ões) pendente(s). Os dados continuam salvos localmente.';
  rdvEditorCard.insertBefore(summary, rdvFormFields);
}

function scheduleOperationalSave() {
  if (!activeRdvDraft || activeStageDrafts.length === 0) return;
  nextOperationalSequence();
  markOperationalPending();
  if (operationalSaveTimer !== null) window.clearTimeout(operationalSaveTimer);
  operationalSaveTimer = window.setTimeout(() => {
    operationalSaveTimer = null;
    void enqueueOperationalSave();
  }, SAVE_DELAY_MS);
}

function buildOperationalSaveEntries(sequence) {
  const packageData = activePackageData();
  if (!packageData || !activeRdvDraft) throw new Error('Rascunho operacional não está aberto.');
  assertVerifiedLeaseAllowsDraft(packageData, activeVerifiedLease);
  const now = new Date().toISOString();

  activeRdvDraft.local_sequence = sequence;
  activeRdvDraft.updated_at_claimed = now;
  for (const stage of activeStageDrafts) {
    stage.local_sequence = sequence;
    stage.updated_at_claimed = now;
  }

  return [
    {
      storeName: 'rdv_drafts',
      id: activeRdvDraft.entity_local_id,
      value: structuredClone(activeRdvDraft),
      localRevision: sequence,
    },
    ...activeStageDrafts.map((stage) => ({
      storeName: 'stage_drafts',
      id: stage.entity_local_id,
      value: structuredClone(stage),
      localRevision: sequence,
    })),
  ];
}

function enqueueOperationalSave() {
  const requestedSequence = operationalNextSequence;
  operationalSaveChain = operationalSaveChain
    .then(async () => {
      if (!vault?.isUnlocked() || !activeRdvDraft) return;
      const packageData = activePackageData();
      assertVerifiedLeaseAllowsDraft(packageData, activeVerifiedLease);

      rdvEditorSaveStatus.className = 'statusline attention';
      rdvEditorSaveStatus.textContent = 'Salvando no tablet…';

      await vault.putJsonBatch(buildOperationalSaveEntries(requestedSequence));

      const persistedRdv = await vault.getJson(
        'rdv_drafts',
        activeRdvDraft.entity_local_id,
      );
      const persistedStages = await Promise.all(
        activeStageDrafts.map((stage) =>
          vault.getJson('stage_drafts', stage.entity_local_id),
        ),
      );
      const allVerified =
        persistedRdv?.localRevision === requestedSequence &&
        persistedStages.every((record) => record?.localRevision === requestedSequence);
      if (!allVerified) {
        throw new Error('Falha no read-back do rascunho operacional.');
      }

      operationalLocalSequence = requestedSequence;
      rdvLocalSequenceLabel.textContent = String(operationalLocalSequence);
      if (operationalNextSequence === requestedSequence) {
        rdvEditorSaveStatus.className = 'statusline ok';
        rdvEditorSaveStatus.textContent = 'Salvo no tablet.';
      } else {
        markOperationalPending();
      }
      refreshDraftValidationPresentation();
      await updateStorageEstimate();
    })
    .catch((error) => {
      console.error('[Pilot Offline] Falha ao salvar rascunho operacional:', error);
      rdvEditorSaveStatus.className = 'statusline error';
      rdvEditorSaveStatus.textContent =
        'Falha ao salvar no tablet. Não continue sem revisar: ' +
        (error instanceof Error ? error.message : 'erro desconhecido');
    });
  return operationalSaveChain;
}

function flushOperationalSave() {
  if (operationalSaveTimer !== null) {
    window.clearTimeout(operationalSaveTimer);
    operationalSaveTimer = null;
  }
  if (!activeRdvDraft || operationalNextSequence === operationalLocalSequence) {
    return operationalSaveChain;
  }
  return enqueueOperationalSave();
}

async function readPersistedOperationalStateForSync() {
  const packageData = activePackageData();
  if (!packageData || !activeRdvDraft) {
    throw new Error('Abra o rascunho operacional antes de transmitir.');
  }
  if (!navigator.onLine) {
    throw new PilotOnlineRequestError(
      'Sem conexão. O rascunho continua salvo no tablet.',
      0,
      'OFFLINE',
    );
  }

  await flushOperationalSave();
  const identity = assertPackageIdentity(packageData);
  const persistedRdv = await vault.getJson('rdv_drafts', rdvDraftRecordId(identity.flightId));
  if (!persistedRdv) throw new Error('Rascunho RDV não encontrado no tablet.');

  const persistedStages = (await vault.listJson('stage_drafts'))
    .filter(
      (record) =>
        Number(record.value?.flight_id) === identity.flightId &&
        String(record.value?.source_package_id) === identity.packageId,
    )
    .sort(
      (left, right) =>
        Number(left.value?.fields?.numero_etapa || 0) -
        Number(right.value?.fields?.numero_etapa || 0),
    );
  if (persistedStages.length === 0) {
    throw new Error('Etapas locais não encontradas para transmissão.');
  }

  const revision = Number(persistedRdv.localRevision || 0);
  if (
    revision < 1 ||
    persistedStages.some((record) => Number(record.localRevision || 0) !== revision)
  ) {
    throw new Error(
      'As revisões locais do RDV e das etapas não estão alinhadas. Salve novamente antes de transmitir.',
    );
  }

  const rdvErrors = validateRdvForm(persistedRdv.value.form, packageData);
  const stageErrors = validateStageDrafts(persistedStages.map((record) => record.value));
  if (Object.keys(rdvErrors).length > 0 || stageErrors.length > 0) {
    throw new Error(
      'Existem validações pendentes. Corrija os campos indicados antes de transmitir.',
    );
  }

  if (persistedRdv.value?.sync_state === 'accepted_requires_refresh') {
    throw new Error(
      'Este rascunho já foi transmitido. Atualize o pacote do voo antes de nova transmissão.',
    );
  }

  const leaseRecord = await verifyStoredLeaseForPackage(packageData);
  if (!leaseRecord?.verified || !leaseRecord.stored?.value?.envelope) {
    throw new Error('Lease offline válido não encontrado para esta transmissão.');
  }
  const deviceId = await vault.getOrCreateDeviceId();

  return {
    packageData,
    identity,
    rdvRecord: persistedRdv,
    stageRecords: persistedStages,
    leaseEnvelope: leaseRecord.stored.value.envelope,
    deviceId,
    revision,
  };
}

async function storeOutboxAttempt(record, patch) {
  const next = {
    ...record.value,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const revision = Number(record.localRevision || 0) + 1;
  await vault.putJson('outbox', record.id, next, revision);
  return vault.getJson('outbox', record.id);
}

async function markDraftAcceptedByServer(command, result) {
  const draftId = rdvDraftRecordId(command.flight_id);
  const stored = await vault.getJson('rdv_drafts', draftId);
  if (!stored) return;

  const currentSequence = Number(stored.value?.local_sequence || 0);
  if (currentSequence !== Number(command.local_sequence)) {
    // O servidor aceitou exatamente o snapshot enfileirado, mas existem
    // mudanças locais posteriores. Preservamos tudo e exigimos refresh/rebase.
    await vault.putJson(
      'conflicts',
      syncReceiptRecordId(command.client_operation_id) + ':local-ahead',
      {
        type: 'local_revision_ahead_after_server_accept',
        command_sequence: command.local_sequence,
        current_local_sequence: currentSequence,
        server_entity_version: result.server_entity_version ?? null,
        created_at: new Date().toISOString(),
      },
      1,
    );
    return;
  }

  await vault.putJson(
    'rdv_drafts',
    draftId,
    {
      ...stored.value,
      sync_state: 'accepted_requires_refresh',
      sync_operation_id: command.client_operation_id,
      synced_server_version: result.server_entity_version ?? null,
      synced_at: new Date().toISOString(),
    },
    stored.localRevision,
  );

  if (activeRdvDraft && Number(activeRdvDraft.flight_id) === Number(command.flight_id)) {
    activeRdvDraft = {
      ...activeRdvDraft,
      sync_state: 'accepted_requires_refresh',
      sync_operation_id: command.client_operation_id,
      synced_server_version: result.server_entity_version ?? null,
      synced_at: new Date().toISOString(),
    };
  }
}

async function persistFinalSyncResult(outboxRecord, result) {
  const command = outboxRecord.value.command;
  const receiptValue = {
    schema_version: 1,
    command_identity: {
      client_operation_id: command.client_operation_id,
      flight_id: command.flight_id,
      local_sequence: command.local_sequence,
      payload_hash: command.payload_hash,
    },
    server_result: structuredClone(result),
    received_at_local: new Date().toISOString(),
  };
  const entries = [
    {
      storeName: 'sync_receipts',
      id: syncReceiptRecordId(command.client_operation_id),
      value: receiptValue,
      localRevision: 1,
    },
  ];
  if (result.status === 'conflict') {
    entries.push({
      storeName: 'conflicts',
      id: syncReceiptRecordId(command.client_operation_id),
      value: {
        ...receiptValue,
        conflict: result.conflict || null,
      },
      localRevision: 1,
    });
  }

  await vault.putJsonBatch(entries);
  const persistedReceipt = await vault.getJson(
    'sync_receipts',
    syncReceiptRecordId(command.client_operation_id),
  );
  if (
    !persistedReceipt ||
    persistedReceipt.value?.command_identity?.payload_hash !== command.payload_hash
  ) {
    throw new Error('Receipt do servidor não foi confirmado no armazenamento local.');
  }

  await vault.deleteJson('outbox', outboxRecord.id);

  if (result.status === 'accepted' || result.status === 'already_accepted') {
    await markDraftAcceptedByServer(command, result);
  }
}

function isRetriableSyncError(error) {
  if (!(error instanceof PilotOnlineRequestError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

async function drainPilotOutbox(options = {}) {
  if (!vault?.isUnlocked() || !navigator.onLine || operationalSyncInFlight) return;

  const onlyFlightId =
    options.onlyFlightId == null ? null : Number(options.onlyFlightId);
  const records = (await vault.listJson('outbox'))
    .filter(
      (record) =>
        record.value?.status === 'pending' &&
        (onlyFlightId === null ||
          Number(record.value?.command?.flight_id) === onlyFlightId),
    )
    .sort((left, right) =>
      String(left.value?.created_at || left.updatedAt || '').localeCompare(
        String(right.value?.created_at || right.updatedAt || ''),
      ),
    );
  if (records.length === 0) {
    await refreshOutboxStatusForActiveFlight();
    return;
  }

  operationalSyncInFlight = true;
  updateSyncButtonState();
  if (activeRdvDraft) renderOperationalEditor({ preserveScroll: true });

  try {
    for (let record of records) {
      const command = record.value?.command;
      if (!command || !(await verifyOfflineSyncCommandHash(command))) {
        throw new Error(
          'Comando da outbox falhou na verificação local de integridade. Dados preservados.',
        );
      }

      record = await storeOutboxAttempt(record, {
        status: 'pending',
        attempt_count: Number(record.value?.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: null,
      });

      try {
        const body = await authenticatedPost('/controle-voos/pilot/offline-sync', {
          commands: [command],
        });
        const result = body?.data?.results?.[0];
        if (
          !result ||
          !['accepted', 'already_accepted', 'conflict', 'rejected_retriable', 'rejected_permanent'].includes(
            result.status,
          )
        ) {
          throw new Error('Resposta de sincronização incompatível com o Pilot App.');
        }

        if (result.status === 'rejected_retriable') {
          await storeOutboxAttempt(record, {
            status: 'pending',
            last_error: {
              code: result.error_code || 'REJECTED_RETRIABLE',
              message: 'Servidor solicitou nova tentativa.',
            },
          });
          setRdvSyncMessage('Servidor solicitou nova tentativa. Outbox preservada.', 'attention');
          break;
        }

        if (result.status === 'rejected_permanent') {
          await storeOutboxAttempt(record, {
            status: 'blocked',
            last_error: {
              code: result.error_code || 'REJECTED_PERMANENT',
              message: 'Comando recusado permanentemente pelo servidor.',
            },
          });
          setServerSyncStatus('Ação necessária');
          setRdvSyncMessage(
            'A transmissão foi bloqueada pelo servidor. Os dados locais continuam preservados.',
            'error',
          );
          break;
        }

        await persistFinalSyncResult(record, result);

        if (result.status === 'conflict') {
          setServerSyncStatus('Conflito');
          setRdvSyncMessage(
            'O servidor mudou desde o pacote baixado. O rascunho local foi preservado para resolução de conflito.',
            'error',
          );
          break;
        }

        setServerSyncStatus('Transmitido');
        setRdvSyncMessage(
          'Receipt confirmado pelo servidor. Atualize o pacote do voo antes de nova edição.',
          'ok',
        );
        if (
          activeRdvDraft &&
          Number(activeRdvDraft.flight_id) === Number(command.flight_id)
        ) {
          closeOperationalEditor();
          setLeaseMessage(
            'Rascunho transmitido. Atualize o pacote deste voo antes de continuar editando.',
            'ok',
          );
        }
      } catch (error) {
        const retriable = isRetriableSyncError(error);
        const updated = await storeOutboxAttempt(record, {
          status: retriable ? 'pending' : 'blocked',
          last_error: {
            code: error instanceof PilotOnlineRequestError ? error.code : null,
            status: error instanceof PilotOnlineRequestError ? error.status : null,
            message: error instanceof Error ? error.message : 'Falha desconhecida',
          },
        });
        record = updated || record;

        setServerSyncStatus(retriable ? 'Pendente de transmissão' : 'Ação necessária');
        setRdvSyncMessage(
          retriable
            ? 'A conexão/servidor não confirmou o envio. A outbox cifrada foi preservada para retry.'
            : 'O servidor recusou a transmissão. Os dados locais foram preservados para revisão.',
          retriable ? 'attention' : 'error',
        );
        break;
      }
    }
  } finally {
    operationalSyncInFlight = false;
    updateSyncButtonState();
    await refreshOutboxStatusForActiveFlight();
  }
}

async function refreshCanonicalPackageForActiveFlight() {
  const packageData = activePackageData();
  const flightId = Number(packageData?.voo?.id || 0);
  if (!flightId || !navigator.onLine || coordinationInFlight) return;
  coordinationInFlight = true;
  await refreshCoordinationControls();
  setCoordinationMessage('Atualizando estado canônico do servidor…', 'attention');
  try {
    await prepareFlightPackage(flightId);
  } finally {
    coordinationInFlight = false;
    await refreshCoordinationControls();
  }
}

async function finalizeCanonicalRdv() {
  if (coordinationInFlight) return;
  const state = await getCoordinationState();
  if (!state.canFinalize || !state.rdv) {
    await refreshCoordinationControls();
    return;
  }
  const expectedVersion = Number(state.rdv.versao);
  if (
    !window.confirm(
      'Finalizar o preenchimento deste RDV no servidor? Depois disso os campos ficam bloqueados até eventual devolução/reabertura.',
    )
  ) {
    return;
  }

  coordinationInFlight = true;
  let requestStarted = false;

  try {
    await persistWorkflowReceipt({
      flightId: state.flightId,
      action: 'finalize',
      expectedVersion,
      state: 'sending',
    });
    await refreshCoordinationControls();
    setCoordinationMessage('Finalizando preenchimento no servidor…', 'attention');

    requestStarted = true;
    const body = await authenticatedPost(
      '/controle-voos/voos/' +
        encodeURIComponent(String(state.flightId)) +
        '/rdv/finalizar-preenchimento',
      { versao: expectedVersion },
    );
    const updated = body?.data;
    if (
      !updated ||
      updated.status !== 'preenchimento_finalizado' ||
      !Number.isInteger(Number(updated.versao)) ||
      Number(updated.versao) <= expectedVersion
    ) {
      throw new Error('Resposta de finalização incompatível com o Pilot App.');
    }
    await persistWorkflowReceipt({
      flightId: state.flightId,
      action: 'finalize',
      expectedVersion,
      state: 'confirmed',
      serverResult: updated,
    });
    setCoordinationMessage(
      'Preenchimento finalizado e confirmado pelo servidor. Atualizando pacote…',
      'ok',
    );
    await prepareFlightPackage(state.flightId);
  } catch (error) {
    if (requestStarted) {
      try {
        await persistWorkflowReceipt({
          flightId: state.flightId,
          action: 'finalize',
          expectedVersion,
          state: 'outcome_unknown',
          error,
        });
      } catch (receiptError) {
        console.error('[Pilot Offline] Falha ao persistir receipt de finalização:', receiptError);
      }
      setCoordinationMessage(
        'Não foi possível confirmar o resultado da finalização. Atualize o pacote do servidor antes de repetir.',
        'error',
      );
    } else {
      setCoordinationMessage(
        'A finalização não foi enviada porque o estado local de segurança não pôde ser persistido.',
        'error',
      );
    }
  } finally {
    coordinationInFlight = false;
    try {
      await refreshCoordinationControls();
    } catch (refreshError) {
      console.error('[Pilot Offline] Falha ao reconciliar controles de finalização:', refreshError);
    }
  }
}

async function sendCanonicalRdvToCoordination() {
  if (coordinationInFlight) return;
  const state = await getCoordinationState();
  if (!state.canSend || !state.rdv) {
    await refreshCoordinationControls();
    return;
  }

  try {
    const alertsBody = await authenticatedGet(
      '/controle-voos/voos/' +
        encodeURIComponent(String(state.flightId)) +
        '/rdv/alertas',
    );
    const blocking = (Array.isArray(alertsBody?.data) ? alertsBody.data : []).filter(
      (alert) => alert?.severidade === 'IMPEDE_ENVIO',
    );
    if (blocking.length > 0) {
      setCoordinationMessage(
        'Envio bloqueado: ' +
          blocking.map((alert) => displayText(alert?.mensagem, 'Alerta operacional')).join('; '),
        'error',
      );
      return;
    }
  } catch (error) {
    setCoordinationMessage(
      error instanceof Error
        ? error.message
        : 'Não foi possível validar os alertas antes do envio.',
      'error',
    );
    return;
  }

  const expectedVersion = Number(state.rdv.versao);
  if (
    !window.confirm(
      'Enviar este RDV para a fila de revisão da Coordenação? Esta ação é separada da sincronização offline.',
    )
  ) {
    return;
  }

  coordinationInFlight = true;
  let requestStarted = false;

  try {
    await persistWorkflowReceipt({
      flightId: state.flightId,
      action: 'send_coordination',
      expectedVersion,
      state: 'sending',
    });
    await refreshCoordinationControls();
    setCoordinationMessage('Enviando RDV à Coordenação…', 'attention');

    requestStarted = true;
    const body = await authenticatedPost(
      '/controle-voos/voos/' +
        encodeURIComponent(String(state.flightId)) +
        '/rdv/enviar',
      { versao: expectedVersion },
    );
    const updated = body?.data;
    if (
      !updated ||
      updated.workflow_status !== 'enviado' ||
      !Number.isInteger(Number(updated.versao)) ||
      Number(updated.versao) <= expectedVersion
    ) {
      throw new Error('Resposta de envio à Coordenação incompatível com o Pilot App.');
    }
    await persistWorkflowReceipt({
      flightId: state.flightId,
      action: 'send_coordination',
      expectedVersion,
      state: 'confirmed',
      serverResult: updated,
    });
    setCoordinationMessage(
      'Recebimento pela Coordenação confirmado pelo servidor. Atualizando pacote…',
      'ok',
    );
    await prepareFlightPackage(state.flightId);
  } catch (error) {
    if (requestStarted) {
      try {
        await persistWorkflowReceipt({
          flightId: state.flightId,
          action: 'send_coordination',
          expectedVersion,
          state: 'outcome_unknown',
          error,
        });
      } catch (receiptError) {
        console.error('[Pilot Offline] Falha ao persistir receipt de handoff:', receiptError);
      }
      setCoordinationMessage(
        'Não foi possível confirmar o recebimento. Atualize o pacote do servidor antes de repetir o envio.',
        'error',
      );
    } else {
      setCoordinationMessage(
        'O envio à Coordenação não foi iniciado porque o estado local de segurança não pôde ser persistido.',
        'error',
      );
    }
  } finally {
    coordinationInFlight = false;
    try {
      await refreshCoordinationControls();
    } catch (refreshError) {
      console.error('[Pilot Offline] Falha ao reconciliar controles de Coordenação:', refreshError);
    }
  }
}

async function queueCurrentDraftForSync() {
  if (operationalSyncInFlight) return;
  if (activePackageData()?.contract?.sync_supported !== true) {
    setRdvSyncMessage(
      'Sincronização ainda não foi habilitada para este pacote de voo.',
      'attention',
    );
    updateSyncButtonState();
    return;
  }

  operationalSyncInFlight = true;
  updateSyncButtonState();
  if (activeRdvDraft) renderOperationalEditor({ preserveScroll: true });

  try {
    const state = await readPersistedOperationalStateForSync();
    const unresolved = (await vault.listJson('outbox')).filter(
      (record) =>
        Number(record.value?.command?.flight_id) === state.identity.flightId &&
        ['pending', 'blocked'].includes(record.value?.status),
    );
    if (unresolved.length > 0) {
      const pending = unresolved.find((record) => record.value?.status === 'pending');
      if (pending) {
        setServerSyncStatus('Pendente de transmissão');
        setRdvSyncMessage(
          'Já existe uma operação pendente para este voo. Tentarei reconciliá-la antes de criar outra.',
          'attention',
        );
      } else {
        throw new Error(
          'Existe uma transmissão bloqueada para este voo. Revise o conflito antes de criar nova operação.',
        );
      }
    } else {
      const command = await buildOfflineSyncCommand({
        packageData: state.packageData,
        rdvDraft: state.rdvRecord.value,
        stageDrafts: state.stageRecords.map((record) => record.value),
        leaseEnvelope: state.leaseEnvelope,
        deviceId: state.deviceId,
      });
      if (!(await verifyOfflineSyncCommandHash(command))) {
        throw new Error('Falha ao verificar o comando antes de gravar a outbox.');
      }

      const id = outboxRecordId(command.client_operation_id);
      await vault.putJson(
        'outbox',
        id,
        {
          schema_version: 1,
          status: 'pending',
          created_at: new Date().toISOString(),
          attempt_count: 0,
          command,
        },
        1,
      );
      const readBack = await vault.getJson('outbox', id);
      if (
        !readBack ||
        readBack.value?.command?.payload_hash !== command.payload_hash ||
        !(await verifyOfflineSyncCommandHash(readBack.value.command))
      ) {
        throw new Error('Falha no read-back da outbox cifrada.');
      }

      setServerSyncStatus('Pendente de transmissão');
      setRdvSyncMessage('Comando cifrado na outbox. Iniciando transmissão…', 'attention');
    }
  } catch (error) {
    setRdvSyncMessage(
      error instanceof Error ? error.message : 'Não foi possível preparar a transmissão.',
      'error',
    );
    operationalSyncInFlight = false;
    updateSyncButtonState();
    if (activeRdvDraft) renderOperationalEditor({ preserveScroll: true });
    return;
  }

  operationalSyncInFlight = false;
  updateSyncButtonState();
  await drainPilotOutbox({
    onlyFlightId: activePackageData()?.voo?.id ?? null,
  });
}

function createEditorField({
  label,
  value,
  type = 'text',
  inputMode,
  wide = false,
  readOnly = false,
  note,
  onInput,
  onBlur,
}) {
  const wrapper = document.createElement('label');
  if (wide) wrapper.classList.add('wide');
  const title = document.createElement('span');
  title.textContent = label;
  const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (type !== 'textarea') input.type = type;
  if (inputMode) input.inputMode = inputMode;
  input.value = value ?? '';
  input.readOnly = readOnly || operationalSyncInFlight;
  if (onInput) input.addEventListener('input', () => onInput(input.value, input));
  if (onBlur) input.addEventListener('blur', () => onBlur(input.value, input));
  wrapper.append(title, input);
  if (note) {
    const noteEl = document.createElement('span');
    noteEl.className = 'field-note';
    noteEl.textContent = note;
    wrapper.append(noteEl);
  }
  return wrapper;
}

function renderRdvFormFields() {
  rdvFormFields.replaceChildren();
  const form = activeRdvDraft.form;

  const fields = [
    ['Número do RDV', 'numero', 'text', null, false, false],
    ['Data do voo', 'data_voo', 'date', null, false, false],
    ['Decolagem real', 'horario_decolagem_real', 'datetime-local', null, false, false],
    ['Pouso real', 'horario_pouso_real', 'datetime-local', null, false, false],
    ['Horas voadas', 'horas_voadas', 'number', 'decimal', false, true],
    ['Pousos', 'numero_pousos', 'number', 'numeric', false, true],
    ['Ciclos', 'ciclos', 'number', 'numeric', false, false],
    ['Combustível decolagem', 'combustivel_decolagem', 'number', 'decimal', false, true],
    ['Combustível pouso', 'combustivel_pouso', 'number', 'decimal', false, true],
    ['Consumo', 'combustivel_consumo', 'number', 'decimal', false, true],
    ['POB', 'pob', 'number', 'numeric', false, true],
    ['Carga (kg)', 'carga_kg', 'number', 'decimal', false, true],
    ['Ocorrências', 'ocorrencias', 'textarea', null, true, false],
    ['Divergências do planejado', 'divergencias', 'textarea', null, true, false],
  ];

  for (const [label, key, type, inputMode, wide, aggregateManaged] of fields) {
    rdvFormFields.append(
      createEditorField({
        label,
        value: form[key],
        type,
        inputMode,
        wide,
        readOnly: aggregateManaged,
        note:
          key === 'ciclos'
            ? 'Não é derivado automaticamente de pousos.'
            : aggregateManaged
              ? 'Calculado a partir das etapas locais.'
              : null,
        onInput: (value) => {
          form[key] = value;
          if (
            key === 'horario_decolagem_real' ||
            key === 'horario_pouso_real'
          ) {
            const hours = calcHorasVoadas(
              form.horario_decolagem_real,
              form.horario_pouso_real,
            );
            if (hours !== null) form.horas_voadas = String(hours);
          }
          if (key === 'combustivel_decolagem' || key === 'combustivel_pouso') {
            const used = calcConsumoCombustivel(
              parseNumber(form.combustivel_decolagem),
              parseNumber(form.combustivel_pouso),
            );
            if (used !== null) form.combustivel_consumo = String(used);
          }
          scheduleOperationalSave();
        },
        onBlur: () => void flushOperationalSave(),
      }),
    );
  }
}

function timingEventMeta(action) {
  timingSequence += 1;
  return {
    action,
    client_claimed_at: new Date().toISOString(),
    monotonic_sequence: timingSequence,
    last_trusted_server_time:
      activePackageData()?.contract?.generated_at || null,
    clock_drift_estimate_ms: null,
  };
}

function applyQuickTiming(stage, field, action) {
  const nowLocal = localDateTimeNow();
  stage.fields[field] = nowLocal;
  stage.timing_events = {
    ...(stage.timing_events || {}),
    [field]: timingEventMeta(action),
  };
  const aggregated = applySafeStageAggregates(
    activeRdvDraft.form,
    activeStageDrafts,
  );
  activeRdvDraft.form = aggregated;
  scheduleOperationalSave();
  renderOperationalEditor({ preserveScroll: true });
}

function renderStageFields() {
  rdvStageFields.replaceChildren();

  for (let index = 0; index < activeStageDrafts.length; index += 1) {
    const stageDraft = activeStageDrafts[index];
    const fields = stageDraft.fields;
    const card = document.createElement('section');
    card.className = 'editor-stage';

    const heading = document.createElement('h3');
    heading.textContent =
      'Etapa ' +
      String(fields.numero_etapa || index + 1) +
      ' · ' +
      displayText(fields.origem_icao) +
      ' → ' +
      displayText(fields.destino_icao);
    card.append(heading);

    const quick = document.createElement('div');
    quick.className = 'actions';
    const actions = [
      ['PARTIDA', 'horario_motor_ligado'],
      ['DECOLAGEM', 'horario_decolagem'],
      ['POUSO', 'horario_pouso'],
      ['CORTE', 'horario_motor_desligado'],
    ];
    for (const [label, field] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = label;
      button.disabled = operationalSyncInFlight;
      button.addEventListener('click', () => applyQuickTiming(stageDraft, field, label));
      quick.append(button);
    }
    card.append(quick);

    const grid = document.createElement('div');
    grid.className = 'editor-grid';
    const stageFields = [
      ['Origem', 'origem_icao', 'text', null],
      ['Destino', 'destino_icao', 'text', null],
      ['Partida motores', 'horario_motor_ligado', 'datetime-local', null],
      ['Decolagem', 'horario_decolagem', 'datetime-local', null],
      ['Pouso', 'horario_pouso', 'datetime-local', null],
      ['Corte motores', 'horario_motor_desligado', 'datetime-local', null],
      ['IFR', 'tempo_ifr', 'number', 'decimal'],
      ['Noturno', 'tempo_noturno', 'number', 'decimal'],
      ['Pousos diurnos', 'pousos_diurnos', 'number', 'numeric'],
      ['Pousos noturnos', 'pousos_noturnos', 'number', 'numeric'],
      ['Starts', 'starts', 'number', 'numeric'],
      ['PAX / POB operacional', 'pax', 'number', 'numeric'],
      ['Payload / carga', 'payload', 'number', 'decimal'],
      ['Combustível início', 'combustivel_inicio', 'number', 'decimal'],
      ['Combustível fim', 'combustivel_fim', 'number', 'decimal'],
      ['Unidade combustível', 'unidade_combustivel', 'text', null],
    ];

    for (const [label, key, type, inputMode] of stageFields) {
      grid.append(
        createEditorField({
          label,
          value: fields[key],
          type,
          inputMode,
          onInput: (value) => {
            fields[key] = value;
            activeRdvDraft.form = applySafeStageAggregates(
              activeRdvDraft.form,
              activeStageDrafts,
            );
            scheduleOperationalSave();
          },
          onBlur: () => {
            activeRdvDraft.form = applySafeStageAggregates(
              activeRdvDraft.form,
              activeStageDrafts,
            );
            void flushOperationalSave();
            renderRdvFormFields();
            refreshDraftValidationPresentation();
          },
        }),
      );
    }

    card.append(grid);
    rdvStageFields.append(card);
  }
}

function renderOperationalEditor(options = {}) {
  if (!activeRdvDraft || !activeVerifiedLease || !activePackageRecord) return;
  const scrollY = window.scrollY;
  const packageData = activePackageData();
  const voo = packageData.voo;

  rdvEditorTitle.textContent = 'Etapas / RDV — ' + displayText(voo.prefixo);
  rdvEditorSubtitle.textContent =
    formatDate(voo.data_programacao) +
    ' · rascunho cifrado local · sem transmissão ao servidor';
  rdvLeaseUntilLabel.textContent = formatTimestamp(
    activeVerifiedLease.claims.valid_until,
  );
  rdvLocalSequenceLabel.textContent = String(operationalLocalSequence);

  renderRdvFormFields();
  renderStageFields();
  refreshDraftValidationPresentation();
  rdvEditorCard.classList.remove('hidden');
  updateSyncButtonState();
  void refreshOutboxStatusForActiveFlight();
  if (options.preserveScroll) window.scrollTo({ top: scrollY });
  else rdvEditorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeOperationalEditor() {
  rdvEditorCard.classList.add('hidden');
  rdvFormFields.replaceChildren();
  rdvStageFields.replaceChildren();
}

function appendInfoGrid(parent, entries) {
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  for (const [label, value] of entries) {
    const cell = document.createElement('div');
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.textContent = displayText(value);
    cell.append(labelEl, valueEl);
    grid.append(cell);
  }
  parent.append(grid);
}

function appendSectionTitle(parent, title) {
  const heading = document.createElement('h3');
  heading.style.marginTop = '20px';
  heading.textContent = title;
  parent.append(heading);
}

function openPackageRecord(record) {
  const packageData = record.value.package;
  const voo = packageData.voo;
  detailTitle.textContent = displayText(voo.prefixo, 'Voo #' + voo.id);
  detailSubtitle.textContent =
    formatDate(voo.data_programacao) +
    ' · ' +
    airportLabel(packageData.origem, voo.origem_id) +
    ' → ' +
    airportLabel(packageData.destino, voo.destino_id);
  detailStatus.textContent =
    'Pacote local cifrado · preparado em ' +
    formatTimestamp(record.value.prepared_at) +
    ' · consulta read-only';
  flightDetail.replaceChildren();

  appendInfoGrid(flightDetail, [
    ['Status do voo', voo.status],
    ['Aeronave', packageData.aeronave?.modelo || voo.aeronave_id],
    ['Pacote', packageData.contract?.package_id],
    ['Partida prevista', formatTimestamp(voo.horario_previsto_partida)],
    ['Chegada prevista', formatTimestamp(voo.horario_previsto_chegada)],
    ['Versão do voo', voo.versao],
  ]);

  appendSectionTitle(flightDetail, 'Tripulação');
  const crew = Array.isArray(packageData.tripulantes) ? packageData.tripulantes : [];
  if (crew.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Nenhum tripulante no snapshot.';
    flightDetail.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'small-list';
    for (const member of crew) {
      const li = document.createElement('li');
      li.textContent =
        displayText(member.nome, 'Funcionário #' + member.funcionario_id) +
        ' · ' +
        displayText(member.funcao);
      list.append(li);
    }
    flightDetail.append(list);
  }

  appendSectionTitle(flightDetail, 'Etapas');
  const stages = Array.isArray(packageData.etapas) ? packageData.etapas : [];
  if (stages.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Nenhuma etapa no snapshot.';
    flightDetail.append(empty);
  } else {
    for (const stage of stages) {
      const stageEl = document.createElement('div');
      stageEl.className = 'stage';
      const title = document.createElement('strong');
      title.textContent =
        'Etapa ' +
        displayText(stage.numero_etapa) +
        ' · ' +
        displayText(stage.origem_icao) +
        ' → ' +
        displayText(stage.destino_icao);
      const info = document.createElement('div');
      info.className = 'flight-subtitle';
      info.textContent =
        'Decolagem ' +
        formatTimestamp(stage.horario_decolagem) +
        ' · Pouso ' +
        formatTimestamp(stage.horario_pouso) +
        ' · PAX ' +
        displayText(stage.pax) +
        ' · Payload ' +
        displayText(stage.payload) +
        ' · Comb. ' +
        displayText(stage.combustivel_inicio) +
        ' → ' +
        displayText(stage.combustivel_fim) +
        ' ' +
        displayText(stage.unidade_combustivel, '');
      stageEl.append(title, info);
      flightDetail.append(stageEl);
    }
  }

  appendSectionTitle(flightDetail, 'Abastecimentos');
  const fuel = Array.isArray(packageData.abastecimentos) ? packageData.abastecimentos : [];
  const fuelList = document.createElement('ul');
  fuelList.className = 'small-list';
  if (fuel.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum abastecimento no snapshot.';
    fuelList.append(li);
  } else {
    for (const entry of fuel) {
      const li = document.createElement('li');
      li.textContent =
        displayText(entry.localidade, 'Local não informado') +
        ' · ' +
        displayText(entry.combustivel_abastecido) +
        ' ' +
        displayText(entry.unidade, '') +
        ' · ' +
        displayText(entry.fornecedor, 'Fornecedor não informado') +
        (entry.tem_anexo ? ' · comprovante vinculado (conteúdo não baixado)' : '');
      fuelList.append(li);
    }
  }
  flightDetail.append(fuelList);

  appendSectionTitle(flightDetail, 'RDV operacional');
  const rdv = packageData.rdv;
  appendInfoGrid(flightDetail, [
    ['Número', rdv?.numero],
    ['Status', rdv?.status],
    ['Fluxo', rdv?.workflow_status],
    ['Versão', rdv?.versao],
    ['POB', rdv?.pob],
    ['Carga', rdv?.carga_kg],
  ]);

  flightDetailCard.classList.remove('hidden');
  void refreshLeaseControls(record);
  void refreshCoordinationControls();
  flightDetailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePackageDetail() {
  closeOperationalEditor();
  activePackageRecord = null;
  activeVerifiedLease = null;
  flightDetailCard.classList.add('hidden');
  flightDetail.replaceChildren();
  prepareEditOfflineButton.disabled = true;
  openLocalDraftButton.disabled = true;
  setLeaseMessage('Abra um pacote de voo para avaliar o lease offline.', 'attention');
  refreshCanonicalPackageButton.disabled = true;
  finalizeRdvServerButton.disabled = true;
  sendRdvCoordinationButton.disabled = true;
  setCoordinationMessage('Abra um pacote de voo para avaliar o fechamento.', 'attention');
  setCoordinationReceipt('');
}

function renderProvisioningState() {
  unlockTitle.textContent = provisioned ? 'Desbloquear dados offline' : 'Preparar armazenamento offline';
  unlockHelp.textContent = provisioned
    ? 'Informe o PIN offline configurado neste tablet.'
    : 'Crie um PIN local para proteger os dados armazenados neste tablet.';
  confirmWrap.classList.toggle('hidden', provisioned);
  unlockButton.textContent = provisioned ? 'Desbloquear' : 'Preparar tablet';
}

async function openWorkspace() {
  await requestPersistentStorage();

  const storedDraft = await vault.getJson('rdv_drafts', DRAFT_ID);
  if (storedDraft) {
    draftInput.value = String(storedDraft.value?.observacoes || '');
    localRevision = storedDraft.localRevision;
    revisionLabel.textContent = String(localRevision);
    lastSavedLabel.textContent = formatTimestamp(storedDraft.updatedAt);
    saveStatus.className = 'statusline ok';
    saveStatus.textContent = 'Rascunho recuperado do tablet.';
  } else {
    draftInput.value = '';
    localRevision = 0;
    revisionLabel.textContent = '0';
    lastSavedLabel.textContent = '—';
    saveStatus.className = 'statusline attention';
    saveStatus.textContent = 'Nenhuma alteração local.';
  }

  unlockCard.classList.add('hidden');
  workspace.classList.remove('hidden');
  pinInput.value = '';
  pinConfirmInput.value = '';
  await loadCachedPackages();
  await updateStorageEstimate();
  await loadOnlineFlights();
}

async function handleUnlock() {
  unlockStatus.className = 'statusline attention';
  unlockStatus.textContent = provisioned ? 'Desbloqueando…' : 'Preparando armazenamento cifrado…';
  unlockButton.disabled = true;

  try {
    const pin = pinInput.value;
    if (!provisioned) {
      if (pin !== pinConfirmInput.value) {
        throw new Error('Os PINs não coincidem.');
      }
      await vault.provision(pin);
      provisioned = true;
    } else {
      await vault.unlock(pin);
    }
    unlockStatus.className = 'statusline ok';
    unlockStatus.textContent = 'Armazenamento offline desbloqueado.';
    await openWorkspace();
  } catch (error) {
    unlockStatus.className = 'statusline error';
    unlockStatus.textContent =
      error instanceof Error ? error.message : 'Falha ao abrir armazenamento offline.';
  } finally {
    unlockButton.disabled = false;
  }
}

function markPending() {
  saveStatus.className = 'statusline attention';
  saveStatus.textContent = 'Alterações locais pendentes…';
}

function enqueueDiagnosticSave(snapshot) {
  saveChain = saveChain
    .then(async () => {
      const nextRevision = localRevision + 1;
      saveStatus.className = 'statusline attention';
      saveStatus.textContent = 'Salvando no tablet…';
      await vault.putJson(
        'rdv_drafts',
        DRAFT_ID,
        {
          observacoes: snapshot,
          local_revision: nextRevision,
          updated_at_claimed: new Date().toISOString(),
        },
        nextRevision,
      );
      localRevision = nextRevision;
      revisionLabel.textContent = String(localRevision);
      lastSavedLabel.textContent = formatTimestamp(new Date().toISOString());

      if (draftInput.value === snapshot) {
        saveStatus.className = 'statusline ok';
        saveStatus.textContent = 'Salvo no tablet.';
      } else {
        markPending();
      }
      await updateStorageEstimate();
    })
    .catch((error) => {
      console.error('[Pilot Offline] Falha ao persistir diagnóstico:', error);
      saveStatus.className = 'statusline error';
      saveStatus.textContent = 'Falha ao salvar no tablet. Não continue sem revisar.';
    });
  return saveChain;
}

function scheduleDiagnosticSave() {
  markPending();
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void enqueueDiagnosticSave(draftInput.value);
  }, SAVE_DELAY_MS);
}

function flushDiagnosticSave() {
  if (!vault?.isUnlocked()) return Promise.resolve();
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  return enqueueDiagnosticSave(draftInput.value);
}

async function lockVault() {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (operationalSaveTimer !== null) {
    window.clearTimeout(operationalSaveTimer);
    operationalSaveTimer = null;
  }
  await Promise.allSettled([flushDiagnosticSave(), flushOperationalSave()]);
  vault.lock();
  cachedPackageRecords = [];
  onlineFlightRecords = [];
  activePackageRecord = null;
  activeVerifiedLease = null;
  activeRdvDraft = null;
  activeStageDrafts = [];
  operationalLocalSequence = 0;
  operationalNextSequence = 0;
  operationalSyncInFlight = false;
  coordinationInFlight = false;
  workspace.classList.add('hidden');
  closePackageDetail();
  unlockCard.classList.remove('hidden');
  unlockStatus.textContent = '';
  sessionStatus.textContent = '';
  renderProvisioningState();
  pinInput.focus();
}

window.addEventListener('online', () => {
  setConnectivity();
  if (vault?.isUnlocked()) {
    void loadOnlineFlights();
    void drainPilotOutbox();
  }
  if (activePackageRecord) {
    void refreshLeaseControls(activePackageRecord);
    void refreshOutboxStatusForActiveFlight();
  }
});
window.addEventListener('offline', () => {
  setConnectivity();
  if (vault?.isUnlocked()) {
    onlineFlightRecords = [];
    renderOnlineFlights();
    setSessionMessage('Offline — mostrando apenas pacotes cifrados já armazenados.', 'attention');
    if (activePackageRecord) {
      void refreshLeaseControls(activePackageRecord);
      void refreshOutboxStatusForActiveFlight();
    }
  }
});
refreshOnlineButton.addEventListener('click', () => void loadOnlineFlights());
prepareEditOfflineButton.addEventListener('click', () => void prepareOfflineEditing());
openLocalDraftButton.addEventListener('click', () => void openExistingOperationalDraft());
syncRdvButton.addEventListener('click', () => void queueCurrentDraftForSync());
refreshCanonicalPackageButton.addEventListener('click', () =>
  void refreshCanonicalPackageForActiveFlight(),
);
finalizeRdvServerButton.addEventListener('click', () => void finalizeCanonicalRdv());
sendRdvCoordinationButton.addEventListener('click', () =>
  void sendCanonicalRdvToCoordination(),
);
closeRdvEditorButton.addEventListener('click', () => void flushOperationalSave().then(closeOperationalEditor));
closeDetailButton.addEventListener('click', closePackageDetail);
draftInput.addEventListener('input', scheduleDiagnosticSave);
draftInput.addEventListener('blur', () => void flushDiagnosticSave());
saveNowButton.addEventListener('click', () => void flushDiagnosticSave());
lockButton.addEventListener('click', () => void lockVault());
unlockButton.addEventListener('click', () => void handleUnlock());
pinInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && provisioned) void handleUnlock();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && vault?.isUnlocked()) {
    void flushDiagnosticSave();
    void flushOperationalSave();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (
    vault?.isUnlocked() &&
    activeRdvDraft &&
    operationalNextSequence !== operationalLocalSequence
  ) {
    // Browsers exibem uma mensagem padrao. O objetivo e impedir refresh/fechamento
    // silencioso enquanto o IndexedDB ainda nao confirmou o read-back cifrado.
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  if (vault?.isUnlocked()) {
    void flushDiagnosticSave();
    void flushOperationalSave();
  }
});

setConnectivity();
await registerPilotServiceWorker();
vault = await PilotVault.open();
provisioned = await vault.isProvisioned();
renderProvisioningState();
await updateStorageEstimate();
