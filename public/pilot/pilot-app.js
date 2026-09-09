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
  buildOfflineSyncPayload,
  collectFinalizationErrors,
  calcConsumoCombustivel,
  calcHorasVoadas,
  parseNumber,
  validateRdvForm,
  validateStageDrafts,
} from '/pilot/pilot-rdv-draft.js';
import {
  buildReadyToTransmitCommand,
  isTransmitPending,
  supersedeLocalCommand,
} from '/pilot/pilot-outbox.js';

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
const pendingCountLabel = document.querySelector('#pending-count');
const finalizeOfflineButton = document.querySelector('#finalize-offline');
const reopenLocalButton = document.querySelector('#reopen-local');
const finalizeStatus = document.querySelector('#finalize-status');

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
    throw new PilotOnlineRequestError('Sem conexão. Não é possível emitir um novo lease offline.');
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
      body?.error || body?.message || 'Falha ao preparar edição offline.',
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
    contract?.sync_supported !== false ||
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
}

async function refreshOutboxCount() {
  if (!vault?.isUnlocked()) {
    pendingCountLabel.textContent = '0';
    return 0;
  }
  const records = await vault.listJson('outbox');
  const pending = records.filter((record) => isTransmitPending(record.value));
  pendingCountLabel.textContent = String(pending.length);
  return pending.length;
}

function setFinalizeMessage(message, kind = 'attention') {
  finalizeStatus.className = 'statusline ' + kind;
  finalizeStatus.textContent = message;
}

function isOperationalDraftClosed() {
  return activeRdvDraft?.local_state === 'ready_to_transmit';
}

function refreshFinalizationControls() {
  const closed = isOperationalDraftClosed();
  finalizeOfflineButton.disabled = closed || !activeVerifiedLease;
  reopenLocalButton.classList.toggle('hidden', !closed);
  reopenLocalButton.disabled = !closed || !activeVerifiedLease;

  if (closed) {
    setFinalizeMessage(
      'Pronto para transmitir · operação ' +
        String(activeRdvDraft.active_outbox_operation_id || 'local') +
        '. O servidor ainda não recebeu estes dados.',
      'ok',
    );
  } else {
    setFinalizeMessage(
      'Rascunho local aberto. Finalizar criará a outbox, sem transmissão automática.',
      'attention',
    );
  }
}

async function finalizeOperationalDraftOffline() {
  const packageData = activePackageData();
  if (!packageData || !activeRdvDraft || activeStageDrafts.length === 0) return;

  try {
    assertVerifiedLeaseAllowsDraft(packageData, activeVerifiedLease);
    await flushOperationalSave();

    if (isOperationalDraftClosed()) {
      refreshFinalizationControls();
      return;
    }

    const errors = collectFinalizationErrors(
      packageData,
      activeRdvDraft,
      activeStageDrafts,
    );
    if (errors.length > 0) {
      setFinalizeMessage(
        'Não é possível finalizar: ' + errors.slice(0, 3).join(' · '),
        'error',
      );
      refreshDraftValidationPresentation();
      return;
    }

    finalizeOfflineButton.disabled = true;
    setFinalizeMessage('Fechando snapshot e criando outbox cifrada…', 'attention');

    const nextSequence =
      Math.max(operationalNextSequence, operationalLocalSequence) + 1;
    const deviceId = await vault.getOrCreateDeviceId();
    const syncPayload = buildOfflineSyncPayload(
      packageData,
      activeRdvDraft,
      activeStageDrafts,
    );
    const command = await buildReadyToTransmitCommand({
      syncPayload,
      rdvDraft: activeRdvDraft,
      stageDrafts: activeStageDrafts,
      localSequence: nextSequence,
      deviceId,
    });
    const now = new Date().toISOString();

    const finalizedRdv = {
      ...structuredClone(activeRdvDraft),
      local_state: 'ready_to_transmit',
      local_sequence: nextSequence,
      updated_at_claimed: now,
      finalized_local_at: now,
      finalized_local_sequence: nextSequence,
      active_outbox_operation_id: command.client_operation_id,
    };
    const finalizedStages = activeStageDrafts.map((stage) => ({
      ...structuredClone(stage),
      local_state: 'ready_to_transmit',
      local_sequence: nextSequence,
      updated_at_claimed: now,
    }));

    await vault.putJsonBatch([
      {
        storeName: 'rdv_drafts',
        id: finalizedRdv.entity_local_id,
        value: finalizedRdv,
        localRevision: nextSequence,
      },
      ...finalizedStages.map((stage) => ({
        storeName: 'stage_drafts',
        id: stage.entity_local_id,
        value: stage,
        localRevision: nextSequence,
      })),
      {
        storeName: 'outbox',
        id: command.client_operation_id,
        value: command,
        localRevision: nextSequence,
      },
    ]);

    const [persistedRdv, persistedCommand] = await Promise.all([
      vault.getJson('rdv_drafts', finalizedRdv.entity_local_id),
      vault.getJson('outbox', command.client_operation_id),
    ]);
    const persistedStages = await Promise.all(
      finalizedStages.map((stage) =>
        vault.getJson('stage_drafts', stage.entity_local_id),
      ),
    );

    if (
      persistedRdv?.value?.local_state !== 'ready_to_transmit' ||
      persistedRdv?.value?.active_outbox_operation_id !== command.client_operation_id ||
      persistedCommand?.value?.payload_hash !== command.payload_hash ||
      persistedCommand?.value?.state !== 'ready_to_transmit' ||
      persistedRdv?.localRevision !== nextSequence ||
      persistedCommand?.localRevision !== nextSequence ||
      !persistedStages.every(
        (record) =>
          record?.value?.local_state === 'ready_to_transmit' &&
          record?.localRevision === nextSequence,
      )
    ) {
      throw new Error('Falha no read-back do snapshot finalizado e da outbox.');
    }

    activeRdvDraft = persistedRdv.value;
    activeStageDrafts = persistedStages.map((record) => record.value);
    operationalLocalSequence = nextSequence;
    operationalNextSequence = nextSequence;
    rdvLocalSequenceLabel.textContent = String(nextSequence);
    rdvEditorSaveStatus.className = 'statusline ok';
    rdvEditorSaveStatus.textContent = 'Snapshot finalizado e salvo no tablet.';
    await refreshOutboxCount();
    renderOperationalEditor({ preserveScroll: true });
    setFinalizeMessage(
      'Pronto para transmitir. Nenhum dado foi enviado ao servidor ou à Coordenação.',
      'ok',
    );
  } catch (error) {
    setFinalizeMessage(
      error instanceof Error
        ? error.message
        : 'Falha ao finalizar o voo no tablet.',
      'error',
    );
    finalizeOfflineButton.disabled = false;
  }
}

async function reopenOperationalDraftLocal() {
  const packageData = activePackageData();
  if (!packageData || !activeRdvDraft || !isOperationalDraftClosed()) return;

  try {
    assertVerifiedLeaseAllowsDraft(packageData, activeVerifiedLease);
    const operationId = activeRdvDraft.active_outbox_operation_id;
    if (!operationId) {
      throw new Error('Rascunho fechado sem operação de outbox vinculada.');
    }

    const storedCommand = await vault.getJson('outbox', operationId);
    if (!storedCommand?.value) {
      throw new Error('Operação de outbox vinculada não foi encontrada.');
    }

    const nextSequence =
      Math.max(operationalNextSequence, operationalLocalSequence) + 1;
    const now = new Date().toISOString();
    const superseded = supersedeLocalCommand(storedCommand.value);
    const reopenedRdv = {
      ...structuredClone(activeRdvDraft),
      local_state: 'draft_local',
      local_sequence: nextSequence,
      updated_at_claimed: now,
      reopened_local_at: now,
      active_outbox_operation_id: null,
    };
    const reopenedStages = activeStageDrafts.map((stage) => ({
      ...structuredClone(stage),
      local_state: 'draft_local',
      local_sequence: nextSequence,
      updated_at_claimed: now,
    }));

    await vault.putJsonBatch([
      {
        storeName: 'rdv_drafts',
        id: reopenedRdv.entity_local_id,
        value: reopenedRdv,
        localRevision: nextSequence,
      },
      ...reopenedStages.map((stage) => ({
        storeName: 'stage_drafts',
        id: stage.entity_local_id,
        value: stage,
        localRevision: nextSequence,
      })),
      {
        storeName: 'outbox',
        id: operationId,
        value: superseded,
        localRevision: nextSequence,
      },
    ]);

    const [persistedRdv, persistedCommand] = await Promise.all([
      vault.getJson('rdv_drafts', reopenedRdv.entity_local_id),
      vault.getJson('outbox', operationId),
    ]);
    if (
      persistedRdv?.value?.local_state !== 'draft_local' ||
      persistedCommand?.value?.state !== 'superseded_local' ||
      persistedRdv?.localRevision !== nextSequence
    ) {
      throw new Error('Falha ao reabrir o rascunho local de forma atômica.');
    }

    activeRdvDraft = persistedRdv.value;
    activeStageDrafts = reopenedStages;
    operationalLocalSequence = nextSequence;
    operationalNextSequence = nextSequence;
    rdvLocalSequenceLabel.textContent = String(nextSequence);
    await refreshOutboxCount();
    renderOperationalEditor({ preserveScroll: true });
    setFinalizeMessage(
      'Rascunho reaberto localmente. A operação anterior foi preservada como superseded_local.',
      'attention',
    );
  } catch (error) {
    setFinalizeMessage(
      error instanceof Error ? error.message : 'Falha ao reabrir rascunho local.',
      'error',
    );
  }
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
  input.readOnly = readOnly;
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
      ['Navegação (HH:MM)', 'tempo_navegacao', 'text', 'numeric'],
      ['IFR (HH:MM)', 'tempo_ifr', 'text', 'numeric'],
      ['Noturno (HH:MM)', 'tempo_noturno', 'text', 'numeric'],
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
  if (vault?.isUnlocked()) void loadOnlineFlights();
  if (activePackageRecord) void refreshLeaseControls(activePackageRecord);
});
window.addEventListener('offline', () => {
  setConnectivity();
  if (vault?.isUnlocked()) {
    onlineFlightRecords = [];
    renderOnlineFlights();
    setSessionMessage('Offline — mostrando apenas pacotes cifrados já armazenados.', 'attention');
    if (activePackageRecord) void refreshLeaseControls(activePackageRecord);
  }
});
refreshOnlineButton.addEventListener('click', () => void loadOnlineFlights());
prepareEditOfflineButton.addEventListener('click', () => void prepareOfflineEditing());
openLocalDraftButton.addEventListener('click', () => void openExistingOperationalDraft());
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
