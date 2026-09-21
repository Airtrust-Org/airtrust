import { PilotVault } from '/pilot/pilot-vault.js';
import { renderPilotWorkspace } from '/pilot/pilot-workspace.js';
import {
  hasTrustedPilotLeaseKeys,
  verifyPilotOfflineLease,
} from '/pilot/pilot-lease.js';
import { PILOT_OFFLINE_APP_VERSION } from '/pilot/pilot-lease-trust.js';
import {
  applySafeStageAggregates,
  applyStageContinuity,
  assertPackageIdentity,
  buildCommonFlightFields,
  assertVerifiedLeaseAllowsDraft,
  buildDraftSnapshot,
  calcConsumoCombustivel,
  calcStageTotalWeight,
  convertWeight,
  calcClockDurationHhMm,
  calcHorasVoadas,
  formatDurationDigits,
  PILOT_DRAFT_SCHEMA_VERSION,
  parseNumber,
  plannedFlightMinutes,
  realizedFlightMinutes,
  requiredJustificationMinutes,
  totalJustificationMinutes,
  toDurationInput,
  toInputTime,
  validateRdvForm,
  validateStageDrafts,
} from '/pilot/pilot-rdv-draft.js';
import {
  buildOfflineSyncCommand,
  verifyOfflineSyncCommandHash,
} from '/pilot/pilot-sync.js';

const DRAFT_ID = 'phase1-synthetic-rdv-draft';
const SAVE_DELAY_MS = 180;
const ACTIVE_FLIGHT_SESSION_ID = 'active-flight';
const PILOT_OFFLINE_FLIGHT_LOCK_KEY = 'airtrust_pilot_offline_flight_locked_v1';
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
const workspace = document.querySelector('#workspace');
const refreshOnlineButton = document.querySelector('#refresh-online');
const sessionStatus = document.querySelector('#session-status');
const flightSelectionCard = document.querySelector('#flight-selection-card');
const onlineFlightsCard = document.querySelector('#online-flights-card');
const cachedFlightsCard = document.querySelector('#cached-flights-card');
const authorizedFlightDate = document.querySelector('#authorized-flight-date');
const authorizedFlightHeading = document.querySelector('#authorized-flight-heading');
const flightDatePrevButton = document.querySelector('#flight-date-prev');
const flightDateTodayButton = document.querySelector('#flight-date-today');
const flightDateNextButton = document.querySelector('#flight-date-next');
const cachedCount = document.querySelector('#cached-count');
const storageLabel = document.querySelector('#storage');
const cachedFlights = document.querySelector('#cached-flights');
const onlineFlights = document.querySelector('#online-flights');
const flightDetailCard = document.querySelector('#flight-detail-card');
const detailTitle = document.querySelector('#detail-title');
const detailSubtitle = document.querySelector('#detail-subtitle');
const detailStatus = document.querySelector('#detail-status');
const flightDetail = document.querySelector('#flight-detail');
const pilotWorkspaceView = document.querySelector('#pilot-workspace-view');
const closeDetailButton = document.querySelector('#close-detail');
const draftInput = document.querySelector('#draft');
const saveStatus = document.querySelector('#save-status');
const revisionLabel = document.querySelector('#revision');
const lastSavedLabel = document.querySelector('#last-saved');
const saveNowButton = document.querySelector('#save-now');
const prepareEditOfflineButton = document.querySelector('#prepare-edit-offline');
const openLocalDraftButton = document.querySelector('#open-local-draft');
const leaseStatus = document.querySelector('#lease-status');
const rdvEditorCard = document.querySelector('#rdv-editor-card');
const rdvEditorTitle = document.querySelector('#rdv-editor-title');
const rdvEditorSubtitle = document.querySelector('#rdv-editor-subtitle');
const rdvEditorSaveStatus = document.querySelector('#rdv-editor-save-status');
const rdvLocalSequenceLabel = document.querySelector('#rdv-local-sequence');
const rdvLeaseUntilLabel = document.querySelector('#rdv-lease-until');
const rdvCoreFields = document.querySelector('#rdv-core-fields');
const rdvFormFields = document.querySelector('#rdv-form-fields');
const rdvStageFields = document.querySelector('#rdv-stage-fields');
const rdvFuelingFields = document.querySelector('#rdv-fueling-fields');
const addStageButton = document.querySelector('#add-stage');
const addFuelingButton = document.querySelector('#add-fueling');
const operationFlow = document.querySelector('#operation-flow');
const closeRdvEditorButton = document.querySelector('#close-rdv-editor');
const syncRdvButton = document.querySelector('#sync-rdv-now');
const rdvSyncStatus = document.querySelector('#rdv-sync-status');
const rdvServerSyncStatus = document.querySelector('#rdv-server-sync-status');
const refreshCanonicalPackageButton = document.querySelector('#refresh-canonical-package');
const finalizeRdvServerButton = document.querySelector('#finalize-rdv-server');
const sendRdvCoordinationButton = document.querySelector('#send-rdv-coordination');
const completeSendRdvButton = document.querySelector('#complete-send-rdv');
const coordinationStatus = document.querySelector('#coordination-status');
const coordinationReceipt = document.querySelector('#coordination-receipt');
const rdvSyncConfirmation = document.querySelector('#rdv-sync-confirmation');
const handoffSuccessCard = document.querySelector('#handoff-success-card');
const handoffSuccessMessage = document.querySelector('#handoff-success-message');
const handoffSuccessDetails = document.querySelector('#handoff-success-details');
const handoffSuccessSummary = document.querySelector('#handoff-success-summary');
const handoffSuccessJustifications = document.querySelector('#handoff-success-justifications');
const handoffSuccessBackButton = document.querySelector('#handoff-success-back');

let vault;
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
let completeSendInFlight = false;
let activeStageTabIndex = 0;
let targetFlightAutoOpened = false;
let offlineFlightLocked = false;
let pilotRefreshPromise = null;
let flightDateManuallySelected = false;
const notifiedFlightVersions = new Set();

function offlineFlightLockMarkerActive() {
  try { return localStorage.getItem(PILOT_OFFLINE_FLIGHT_LOCK_KEY) === '1'; } catch { return false; }
}

function writeOfflineFlightLockMarker(locked) {
  try {
    if (locked) localStorage.setItem(PILOT_OFFLINE_FLIGHT_LOCK_KEY, '1');
    else localStorage.removeItem(PILOT_OFFLINE_FLIGHT_LOCK_KEY);
  } catch {}
}

async function enterOfflineFlightMode(packageData) {
  const identity = assertPackageIdentity(packageData);
  await vault.putJson('active_sessions', ACTIVE_FLIGHT_SESSION_ID, {
    tenant_id: identity.tenantId,
    user_id: identity.userId,
    flight_id: identity.flightId,
    package_id: identity.packageId,
    locked_at: new Date().toISOString(),
  }, 1);
  offlineFlightLocked = true;
  writeOfflineFlightLockMarker(true);
  setConnectivity();
}

async function exitOfflineFlightMode() {
  offlineFlightLocked = false;
  writeOfflineFlightLockMarker(false);
  if (vault?.isUnlocked()) {
    await vault.deleteJson('active_sessions', ACTIVE_FLIGHT_SESSION_ID).catch(() => undefined);
  }
  setConnectivity();
}

function readStoredAuthValue(key) {
  try {
    const local = window.localStorage?.getItem(key);
    if (local) return { value: local, persistent: true };
  } catch {}
  try {
    const session = window.sessionStorage?.getItem(key);
    if (session) return { value: session, persistent: false };
  } catch {}
  return { value: null, persistent: false };
}

function writeStoredAuthValue(key, value, persistent) {
  try {
    if (persistent) {
      window.localStorage?.setItem(key, value);
      window.sessionStorage?.removeItem(key);
    } else {
      window.sessionStorage?.setItem(key, value);
      window.localStorage?.removeItem(key);
    }
  } catch {}
}

function readCurrentRefreshToken() {
  return readStoredAuthValue('airtrust_refresh_token');
}

async function refreshPilotOnlineSession() {
  if (pilotRefreshPromise) return pilotRefreshPromise;
  const stored = readCurrentRefreshToken();
  if (!stored.value) {
    throw new PilotOnlineRequestError('Sessão online expirada e sem renovação disponível.', 401, 'MISSING_REFRESH_TOKEN');
  }
  pilotRefreshPromise = (async () => {
    const response = await fetch(API_BASE_URL + '/auth/refresh', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored.value }),
    });
    const body = await response.json().catch(() => null);
    const accessToken = body?.data?.accessToken;
    const refreshToken = body?.data?.refreshToken;
    if (!response.ok || !accessToken) {
      throw new PilotOnlineRequestError(
        body?.error || body?.message || 'Não foi possível renovar a sessão online.',
        response.status || 401,
        body?.code || 'REFRESH_FAILED',
      );
    }
    writeStoredAuthValue('airtrust_token', accessToken, stored.persistent);
    if (refreshToken) writeStoredAuthValue('airtrust_refresh_token', refreshToken, stored.persistent);
    return accessToken;
  })();
  try {
    return await pilotRefreshPromise;
  } finally {
    pilotRefreshPromise = null;
  }
}

function assertAutomaticNetworkAllowed(options = {}) {
  if (offlineFlightLocked && options.allowDuringFlight !== true) {
    throw new PilotOnlineRequestError(
      'Modo voo offline ativo. A conexão automática está bloqueada até você enviar ou sair do voo.',
      0,
      'OFFLINE_FLIGHT_LOCKED',
    );
  }
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function tomorrowDateKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateKey(tomorrow);
}

function smartDefaultFlightDate(flights) {
  const tomorrow = tomorrowDateKey();
  return Array.isArray(flights) && flights.some((voo) => flightDateKey(voo?.data_programacao) === tomorrow)
    ? tomorrow
    : localDateKey();
}

function flightDateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

function selectedFlightDateKey() {
  return authorizedFlightDate?.value || localDateKey();
}

function displaySelectedFlightDate() {
  return formatDate(selectedFlightDateKey());
}

function setSelectedFlightDate(value) {
  if (!authorizedFlightDate) return;
  authorizedFlightDate.value = value || localDateKey();
  if (authorizedFlightHeading) {
    authorizedFlightHeading.textContent =
      selectedFlightDateKey() === localDateKey()
        ? 'Voos de hoje'
        : 'Voos de ' + displaySelectedFlightDate();
  }
  renderOnlineFlights();
  renderCachedPackages();
}

function shiftSelectedFlightDate(days) {
  const base = new Date(selectedFlightDateKey() + 'T12:00:00');
  if (Number.isNaN(base.getTime())) return;
  base.setDate(base.getDate() + days);
  setSelectedFlightDate(localDateKey(base));
}

function updateFlightSelectionMode() {
  if (!onlineFlightsCard || !cachedFlightsCard) return;
  if (flightSelectionCard?.classList.contains('hidden')) {
    cachedFlightsCard.classList.add('hidden');
    return;
  }
  if (navigator.onLine) {
    onlineFlightsCard.classList.remove('hidden');
    cachedFlightsCard.classList.add('hidden');
  } else {
    onlineFlightsCard.classList.add('hidden');
    cachedFlightsCard.classList.remove('hidden');
  }
}

function setFlightSelectionVisible(visible) {
  if (flightSelectionCard) flightSelectionCard.classList.toggle('hidden', !visible);
  if (!visible) {
    if (cachedFlightsCard) cachedFlightsCard.classList.add('hidden');
    return;
  }
  updateFlightSelectionMode();
}

if (authorizedFlightDate && !authorizedFlightDate.value) {
  authorizedFlightDate.value = localDateKey();
}
if (authorizedFlightHeading) authorizedFlightHeading.textContent = 'Voos de hoje';

function setConnectivity() {
  const online = navigator.onLine;
  connectivity.className = 'pill ' + (offlineFlightLocked || !online ? 'attention' : 'ok');
  connectivity.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'dot';
  const text = document.createElement('span');
  text.textContent = offlineFlightLocked
    ? (online ? 'MODO VOO OFFLINE — sinal ignorado' : 'MODO VOO OFFLINE — sem sinal')
    : (online ? 'ONLINE' : 'OFFLINE — operação local ativa');
  connectivity.append(dot, text);
  refreshOnlineButton.disabled = offlineFlightLocked || !online;
  if (!offlineFlightLocked) updateFlightSelectionMode();
  if (activePackageRecord) void refreshCoordinationControls();
}

setConnectivity();

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

function cleanOperationalPointName(value) {
  let text = String(value || '').trim();
  for (const prefix of ['PLATAFORMA /', 'NAVIO /', 'AERÓDROMO /', 'AERODROMO /', 'HELIPONTO /', 'AEROPORTO /']) {
    if (text.toLocaleUpperCase('pt-BR').startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  if (text.includes(' / ')) {
    const parts = text.split(' / ').map((item) => item.trim()).filter(Boolean);
    if (parts.length > 1) text = parts[parts.length - 1];
  }
  return text;
}

function operationalPointLabel(point) {
  if (!point) return '—';
  const primary = String(point.codigo || point.codigo_icao || '').trim().toUpperCase();
  const icao = String(point.codigo_icao || '').trim().toUpperCase();
  const codes = [primary, icao].filter((code, index, items) => code && items.indexOf(code) === index);
  const name = cleanOperationalPointName(point.nome);
  if (!name) return codes.join(' · ') || '—';
  return codes.length > 0 ? name + ' (' + codes.join(' · ') + ')' : name;
}

function operationalPointKey(point) {
  if (!point) return '';
  if (Number(point.id) > 0) return 'id:' + String(Number(point.id));
  return 'code:' + String(point.codigo_icao || point.codigo || '').trim().toUpperCase();
}

function operationalRouteLabelForFlight(voo, fallbackOrigin = null, fallbackDestination = null) {
  const points = Array.isArray(voo?.rota_pontos) ? voo.rota_pontos.filter(Boolean) : [];
  if (points.length >= 2) {
    const origin = points[0];
    const finalPoint = points[points.length - 1];
    const returnsToOrigin = operationalPointKey(origin) && operationalPointKey(origin) === operationalPointKey(finalPoint);
    const destinations = returnsToOrigin ? points.slice(1, -1) : points.slice(1);
    const unique = [];
    for (const point of destinations) {
      const key = operationalPointKey(point);
      if (!key || unique.some((item) => operationalPointKey(item) === key)) continue;
      unique.push(point);
    }
    return operationalPointLabel(origin) + ' → ' + (unique.length > 0 ? unique.map(operationalPointLabel).join(' → ') : operationalPointLabel(finalPoint));
  }
  const codes = Array.isArray(voo?.rota_codigos) ? voo.rota_codigos.filter(Boolean) : [];
  if (codes.length >= 2) {
    const returnsToOrigin = String(codes[0]) === String(codes[codes.length - 1]);
    const visible = returnsToOrigin ? codes.slice(0, -1) : codes;
    return visible.join(' → ');
  }
  return airportLabel(fallbackOrigin, voo?.origem_id) + ' → ' + airportLabel(fallbackDestination, voo?.destino_id);
}

function flightListTitle(voo) {
  const aircraft = displayText(voo?.prefixo, 'Voo #' + displayText(voo?.id));
  const number = String(voo?.numero_voo || '').trim();
  return number ? aircraft + ' · Voo ' + number : aircraft;
}

const JUSTIFICATION_ACRONYMS = [
  'PAX', 'UM', 'HMS', 'IFR', 'SITAER', 'SAP', 'SEGPRO', 'ANAC', 'DECEA', 'ADSB',
  'EPTA', 'INFRAERO', 'ACC', 'GPU', 'SLO', 'SCA', 'CHC',
];

function formatJustificationName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let text = raw.toLocaleLowerCase('pt-BR');
  text = text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
  for (const acronym of JUSTIFICATION_ACRONYMS) {
    text = text.replace(new RegExp('\b' + acronym.toLocaleLowerCase('pt-BR') + '\b', 'giu'), acronym);
  }
  const properNames = [
    ['petrobras', 'Petrobras'],
    ['costa do sol', 'Costa do Sol'],
    ['bristow', 'Bristow'],
    ['líder', 'Líder'],
    ['lider', 'Líder'],
    ['omni', 'Omni'],
  ];
  for (const [needle, replacement] of properNames) {
    text = text.replace(new RegExp(needle, 'giu'), replacement);
  }
  return text;
}

function appendHandoffSummaryCell(label, value) {
  const cell = document.createElement('div');
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = displayText(value);
  cell.append(labelEl, valueEl);
  handoffSuccessSummary.append(cell);
}

function buildHandoffSuccessSnapshot(serverResult) {
  const packageData = activePackageData() || {};
  const voo = packageData.voo || {};
  const common = activeRdvDraft?.common || {};
  const form = activeRdvDraft?.form || {};
  const route = activeStageDrafts
    .map((stage) => {
      const fields = stage?.fields || {};
      const origin = String(fields.origem_icao || '').trim();
      const destination = String(fields.destino_icao || '').trim();
      return origin && destination ? origin + ' → ' + destination : '';
    })
    .filter(Boolean)
    .join(' · ');
  const catalog = Array.isArray(packageData?.catalogos?.justificativas_voo)
    ? packageData.catalogos.justificativas_voo
    : [];
  const justifications = (Array.isArray(activeRdvDraft?.justifications)
    ? activeRdvDraft.justifications
    : [])
    .map((item) => {
      const code = String(item?.justificativa_codigo || '').trim().toUpperCase();
      const match = catalog.find((option) => String(option?.codigo || '').trim().toUpperCase() === code);
      return {
        code,
        name: formatJustificationName(match?.nome || code),
        minutes: Number(item?.minutos || 0),
      };
    })
    .filter((item) => item.code && item.minutes > 0);

  return {
    flightNumber: voo.numero_voo || common.numero_voo || ('Voo #' + displayText(voo.id, '—')),
    aircraft: voo.prefixo || packageData?.aeronave?.prefixo || '—',
    date: formatDate(voo.data_programacao),
    route: route || [packageData?.origem?.codigo_icao, packageData?.destino?.codigo_icao].filter(Boolean).join(' → ') || '—',
    flightTime: form.tempo_voo_total_hhmm || '—',
    landings: form.numero_pousos || '0',
    sentAt: serverResult?.enviado_em || new Date().toISOString(),
    justifications,
  };
}

function showHandoffSuccess(snapshot) {
  handoffSuccessSummary.replaceChildren();
  handoffSuccessJustifications.replaceChildren();
  appendHandoffSummaryCell('Voo', snapshot.flightNumber);
  appendHandoffSummaryCell('Aeronave', snapshot.aircraft);
  appendHandoffSummaryCell('Data', snapshot.date);
  appendHandoffSummaryCell('Etapas', snapshot.route);
  appendHandoffSummaryCell('Tempo realizado', snapshot.flightTime);
  appendHandoffSummaryCell('Pousos', snapshot.landings);
  appendHandoffSummaryCell('Enviado em', formatTimestamp(snapshot.sentAt));
  appendHandoffSummaryCell('Status', 'Aguardando processamento da Coordenação');

  for (const item of snapshot.justifications) {
    const row = document.createElement('li');
    const code = document.createElement('span');
    code.className = 'justification-picker-code';
    code.textContent = item.code;
    const text = document.createElement('span');
    text.textContent = item.name + ' · ' + String(item.minutes) + ' min';
    row.append(code, text);
    handoffSuccessJustifications.append(row);
  }
  if (snapshot.justifications.length === 0) {
    const row = document.createElement('li');
    row.textContent = 'Nenhuma justificativa de desvio foi necessária.';
    handoffSuccessJustifications.append(row);
  }

  handoffSuccessMessage.textContent =
    'As informações do voo foram transmitidas e o recebimento foi confirmado pelo servidor em ' +
    formatTimestamp(snapshot.sentAt) + '.';
  handoffSuccessDetails.open = false;
  setFlightSelectionVisible(false);
  flightDetailCard.classList.add('hidden');
  rdvEditorCard.classList.add('hidden');
  handoffSuccessCard.classList.remove('hidden');
  handoffSuccessCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pilotNatureOptions(packageData) {
  const rows = Array.isArray(packageData?.catalogos?.naturezas_voo)
    ? packageData.catalogos.naturezas_voo
    : [];
  const options = rows
    .map((row) => ({
      code: String(row?.codigo || '').trim(),
      label: String(row?.nome || row?.codigo || '').trim(),
    }))
    .filter((option) => option.code);

  const current = packageData?.natureza;
  const currentCode = String(current?.codigo || '').trim();
  if (currentCode && !options.some((option) => option.code === currentCode)) {
    options.unshift({
      code: currentCode,
      label: String(current?.nome || currentCode).trim(),
    });
  }
  return options;
}

function pilotFuelingCompanyOptions(packageData) {
  const rows = Array.isArray(packageData?.catalogos?.empresas_abastecimento)
    ? packageData.catalogos.empresas_abastecimento
    : [];
  return rows
    .map((row) => ({
      code: String(row?.codigo || '').trim(),
      label: String(row?.nome || row?.codigo || '').trim(),
    }))
    .filter((option) => option.code);
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

async function authenticatedRequest(method, path, payload, options = {}) {
  assertAutomaticNetworkAllowed(options);
  if (!navigator.onLine) {
    throw new PilotOnlineRequestError('Sem conexão. Esta operação online não pode ser executada.');
  }

  let token = readCurrentAccessToken();
  if (!token) token = await refreshPilotOnlineSession();

  const doFetch = async (accessToken) => {
    const init = {
      method,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
    };
    if (payload !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(payload);
    }
    return fetch(API_BASE_URL + path, init);
  };

  let response = await doFetch(token);
  if (response.status === 401 && readCurrentRefreshToken().value) {
    token = await refreshPilotOnlineSession();
    response = await doFetch(token);
  }
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

async function authenticatedGet(path, options = {}) {
  return authenticatedRequest('GET', path, undefined, options);
}

async function authenticatedBlob(path, options = {}) {
  assertAutomaticNetworkAllowed(options);
  if (!navigator.onLine) throw new PilotOnlineRequestError('Sem conexão. O documento ainda não pode ser aberto.');
  let token = readCurrentAccessToken();
  if (!token) token = await refreshPilotOnlineSession();
  const doFetch = (accessToken) => fetch(API_BASE_URL + path, {
    method: 'GET', cache: 'no-store', credentials: 'include',
    headers: { Accept: '*/*', Authorization: 'Bearer ' + accessToken },
  });
  let response = await doFetch(token);
  if (response.status === 401 && readCurrentRefreshToken().value) {
    token = await refreshPilotOnlineSession();
    response = await doFetch(token);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new PilotOnlineRequestError(body?.error || body?.message || 'Falha ao abrir documento do voo.', response.status, body?.code || null);
  }
  return response.blob();
}

async function openFlightDocument(documentEventId) {
  const flightId = activePackageData()?.voo?.id;
  if (!flightId || !documentEventId) return;
  try {
    const blob = await authenticatedBlob(
      '/controle-voos/voos/' + encodeURIComponent(String(flightId)) + '/documentos/' + encodeURIComponent(String(documentEventId)),
      { allowDuringFlight: true },
    );
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    setSessionMessage(error instanceof Error ? error.message : 'Falha ao abrir documento.', 'error', error instanceof PilotOnlineRequestError && error.status === 401);
  }
}

async function authenticatedPost(path, payload, options = {}) {
  return authenticatedRequest('POST', path, payload, options);
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

function makeFlightItem({ title, subtitle, badge, buttonText, onClick, disabled = false, secondaryButtonText = null, onSecondaryClick = null }) {
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

  const actions = document.createElement('div');
  actions.className = 'flight-item-actions';
  if (secondaryButtonText && typeof onSecondaryClick === 'function') {
    const secondary = document.createElement('button');
    secondary.className = 'secondary';
    secondary.type = 'button';
    secondary.textContent = secondaryButtonText;
    secondary.disabled = disabled;
    secondary.addEventListener('click', onSecondaryClick);
    actions.append(secondary);
  }
  actions.append(button);

  item.append(copy, actions);
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
  const selectedDate = selectedFlightDateKey();
  const visibleRecords = cachedPackageRecords.filter(
    (record) => flightDateKey(record.value?.package?.voo?.data_programacao) === selectedDate,
  );

  if (visibleRecords.length === 0) {
    renderEmpty(
      cachedFlights,
      'Nenhum voo salvo neste tablet para ' + displaySelectedFlightDate() + '.',
    );
    return;
  }

  cachedFlights.replaceChildren();
  for (const record of visibleRecords) {
    const packageData = record.value.package;
    const voo = packageData.voo;
    const route = operationalRouteLabelForFlight(
      voo,
      packageData.origem,
      packageData.destino,
    );
    cachedFlights.append(
      makeFlightItem({
        title: flightListTitle(voo),
        subtitle: formatDate(voo.data_programacao) + ' · ' + route,
        badge: 'Disponível offline',
        buttonText: 'Abrir voo',
        onClick: async () => {
          openPackageRecord(record);
          await openExistingOperationalDraft();
        },
      }),
    );
  }
}

function cachedPackageForFlight(flightId) {
  return cachedPackageRecords.find((record) => packageRecordFlightId(record) === Number(flightId)) || null;
}

function flightPackageNeedsUpdate(voo) {
  const cached = cachedPackageForFlight(voo?.id);
  if (!cached) return false;
  return Number(voo?.versao || 0) > Number(cached.value?.package?.voo?.versao || 0);
}

async function notifyFlightUpdate(voo) {
  const version = Number(voo?.versao || 0);
  const key = String(voo?.id) + ':' + String(version);
  if (!version || notifiedFlightVersions.has(key)) return;
  notifiedFlightVersions.add(key);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    await registration?.showNotification?.('AirTrust — voo atualizado', {
      body: flightListTitle(voo) + ' recebeu uma alteração da Coordenação. Abra o Pilot App e atualize o voo.',
      tag: 'airtrust-flight-' + String(voo.id),
    });
  } catch {}
}

function renderOnlineFlights() {
  const selectedDate = selectedFlightDateKey();
  if (authorizedFlightHeading) {
    authorizedFlightHeading.textContent =
      selectedDate === localDateKey()
        ? 'Voos de hoje'
        : 'Voos de ' + displaySelectedFlightDate();
  }

  if (!navigator.onLine) {
    renderEmpty(onlineFlights, 'Sem conexão. Abra um voo já salvo neste tablet.');
    return;
  }

  const filtered = onlineFlightRecords.filter(
    (voo) => flightDateKey(voo.data_programacao) === selectedDate,
  );
  if (filtered.length === 0) {
    renderEmpty(
      onlineFlights,
      'Nenhum voo autorizado para ' + displaySelectedFlightDate() + '.',
    );
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    if (String(a.id) === String(TARGET_FLIGHT_ID)) return -1;
    if (String(b.id) === String(TARGET_FLIGHT_ID)) return 1;
    return String(a.horario_previsto_partida || '').localeCompare(
      String(b.horario_previsto_partida || ''),
    );
  });

  onlineFlights.replaceChildren();
  for (const voo of sorted) {
    const cached = Boolean(cachedPackageForFlight(voo.id));
    const stale = flightPackageNeedsUpdate(voo);
    if (stale) void notifyFlightUpdate(voo);
    onlineFlights.append(
      makeFlightItem({
        title: flightListTitle(voo),
        subtitle:
          formatDate(voo.data_programacao) +
          ' · ' + operationalRouteLabelForFlight(voo) +
          ' · ' +
          (toInputTime(voo.horario_previsto_partida)
            ? 'partida ' + toInputTime(voo.horario_previsto_partida)
            : 'horário não informado'),
        badge: stale ? 'Alteração da Coordenação — atualize o voo' : (cached ? 'Já preparado neste tablet' : null),
        buttonText: stale ? 'Atualizar voo' : 'Abrir voo',
        secondaryButtonText: 'Fazer plano de voo',
        disabled: !navigator.onLine,
        onClick: () => void openAuthorizedFlight(voo.id),
        onSecondaryClick: () => void openFlightPlanning(voo.id),
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

async function restoreActiveOfflineFlight() {
  const session = await vault.getJson('active_sessions', ACTIVE_FLIGHT_SESSION_ID);
  if (!session?.value) {
    writeOfflineFlightLockMarker(false);
    offlineFlightLocked = false;
    return false;
  }
  const locked = session.value;
  const record = cachedPackageRecords.find((candidate) => {
    const packageData = candidate?.value?.package;
    if (!packageData) return false;
    const identity = assertPackageIdentity(packageData);
    return Number(identity.tenantId) === Number(locked.tenant_id) &&
      Number(identity.userId) === Number(locked.user_id) &&
      Number(identity.flightId) === Number(locked.flight_id) &&
      String(identity.packageId) === String(locked.package_id);
  });
  if (!record) {
    await exitOfflineFlightMode();
    return false;
  }
  offlineFlightLocked = true;
  writeOfflineFlightLockMarker(true);
  setConnectivity();
  activePackageRecord = record;
  const opened = await openExistingOperationalDraft();
  if (!opened) {
    await exitOfflineFlightMode();
    return false;
  }
  setSessionMessage('Voo offline restaurado neste tablet. A conexão automática continua bloqueada.', 'ok');
  return true;
}

async function loadOnlineFlights() {
  if (!vault?.isUnlocked() || offlineFlightLocked) return;
  if (!navigator.onLine) {
    setSessionMessage('Offline — mostrando os voos já preparados neste tablet.', 'attention');
    onlineFlightRecords = [];
    renderOnlineFlights();
    return;
  }

  refreshOnlineButton.disabled = true;
  setSessionMessage('Consultando voos autorizados…', 'attention');
  try {
    const body = await authenticatedGet('/controle-voos/voos/meus');
    onlineFlightRecords = Array.isArray(body?.data) ? body.data : [];
    if (!flightDateManuallySelected && !TARGET_FLIGHT_ID) {
      setSelectedFlightDate(smartDefaultFlightDate(onlineFlightRecords));
    }
    for (const voo of onlineFlightRecords) {
      if (flightPackageNeedsUpdate(voo)) void notifyFlightUpdate(voo);
    }
    setSessionMessage(
      onlineFlightRecords.length > 0
        ? 'Selecione um voo para iniciar o preenchimento.'
        : 'Nenhum voo autorizado foi encontrado.',
      'ok',
    );

    const targetedFlight = TARGET_FLIGHT_ID
      ? onlineFlightRecords.find((voo) => String(voo.id) === String(TARGET_FLIGHT_ID))
      : null;
    if (targetedFlight && !targetFlightAutoOpened) {
      targetFlightAutoOpened = true;
      const targetDate = flightDateKey(targetedFlight.data_programacao);
      if (targetDate) setSelectedFlightDate(targetDate);
      await openAuthorizedFlight(targetedFlight.id);
      return;
    }

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

async function prepareFlightPackage(flightId, options = {}) {
  if (!vault?.isUnlocked()) return;
  setSessionMessage('Preparando o voo para uso offline…', 'attention');
  refreshOnlineButton.disabled = true;

  try {
    const body = await authenticatedGet(
      '/controle-voos/voos/' + encodeURIComponent(String(flightId)) + '/offline-package',
      options,
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
      'Voo preparado neste tablet. Você pode continuar mesmo se a conexão cair.',
      'ok',
    );
    await loadCachedPackages();
    if (offlineFlightLocked && options.allowDuringFlight === true) {
      activePackageRecord = persisted;
      setFlightSelectionVisible(false);
      rdvEditorCard.classList.remove('hidden');
    } else {
      openPackageRecord(persisted, options.initialWorkspaceTab || 'summary');
    }
    await updateStorageEstimate();
    return persisted;
  } catch (error) {
    const authFailure = error instanceof PilotOnlineRequestError && error.status === 401;
    setSessionMessage(
      error instanceof Error ? error.message : 'Falha ao preparar pacote offline.',
      'error',
      authFailure,
    );
    return null;
  } finally {
    refreshOnlineButton.disabled = !navigator.onLine;
  }
}

async function ensurePilotShellReadyForFlight() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('O modo offline não está disponível neste navegador.');
  }

  const registration = await navigator.serviceWorker.ready;
  if (new URL(registration.scope).pathname !== '/pilot/') {
    throw new Error('O modo offline do Pilot App não está ativo.');
  }

  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        navigator.serviceWorker.removeEventListener('controllerchange', finish);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
      window.setTimeout(finish, 5000);
    });
  }

  const controller = navigator.serviceWorker.controller;
  if (!controller || !new URL(controller.scriptURL).pathname.endsWith('/pilot/pilot-sw.js')) {
    throw new Error('O Pilot App ainda não está pronto para continuar offline. Recarregue e tente novamente.');
  }
}

async function openFlightPlanning(flightId) {
  return Boolean(await prepareFlightPackage(flightId, { initialWorkspaceTab: 'planning' }));
}

async function openAuthorizedFlight(flightId) {
  const record = await prepareFlightPackage(flightId);
  if (!record) return false;

  try {
    await ensurePilotShellReadyForFlight();
  } catch (error) {
    setSessionMessage(
      error instanceof Error ? error.message : 'O modo offline do Pilot App não ficou pronto.',
      'error',
    );
    return false;
  }

  return prepareOfflineEditing();
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

  const [latestSync, latestConflict, finalizeReceipt, sendReceipt] = await Promise.all([
    latestAcceptedSyncReceiptForFlight(flightId),
    latestConflictForFlight(flightId),
    latestWorkflowReceiptForFlight(flightId, 'finalize'),
    latestWorkflowReceiptForFlight(flightId, 'send_coordination'),
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

  const packagePreparedAt = String(activePackageRecord?.value?.prepared_at || '');
  const packageMatchesAcceptedSync =
    Boolean(rdv && latestSync) &&
    Number(rdv.versao) === Number(latestSync.value?.server_result?.server_entity_version);

  const workflowBlocker = (receipt, action) => {
    if (!receipt?.value || !rdv) return null;
    const value = receipt.value;
    const expectedVersion = Number(value.expected_version);
    const resultVersion = Number(value.server_result?.versao || 0);
    const receiptTime = String(value.updated_at_local || receipt.updatedAt || '');
    const refreshedAfterReceipt = Boolean(packagePreparedAt && receiptTime && packagePreparedAt > receiptTime);
    const desiredReached =
      action === 'finalize'
        ? rdv.status === 'preenchimento_finalizado' && Number(rdv.versao) > expectedVersion
        : rdv.workflow_status === 'enviado' && Number(rdv.versao) > expectedVersion;

    if (value.state === 'confirmed') {
      if (resultVersion > 0 && Number(rdv.versao) < resultVersion) {
        return 'A ação já foi confirmada pelo servidor. Atualize o pacote antes de continuar.';
      }
      if (!desiredReached && resultVersion > 0 && Number(rdv.versao) <= resultVersion) {
        return 'O receipt confirmado ainda não está refletido neste pacote. Atualize do servidor.';
      }
      return null;
    }

    if (value.state === 'sending' || value.state === 'outcome_unknown') {
      if (!refreshedAfterReceipt) {
        return 'O resultado da última ação ainda é incerto. Atualize do servidor antes de repetir.';
      }
      if (desiredReached) return null;
      if (Number(rdv.versao) === expectedVersion) return null;
      return 'O servidor avançou para outro estado após a tentativa. Revise o pacote antes de nova ação.';
    }

    return null;
  };

  const finalizeBlocker = workflowBlocker(finalizeReceipt, 'finalize');
  const sendBlocker = workflowBlocker(sendReceipt, 'send_coordination');
  const packageRequiredJustificationMinutes = requiredJustificationMinutes(
    packageData,
    packageData.etapas || [],
  );
  const packageAssignedJustificationMinutes = totalJustificationMinutes(
    packageData.justificativas || [],
  );
  const justificationBlocker =
    packageRequiredJustificationMinutes > 0 &&
    packageAssignedJustificationMinutes !== packageRequiredJustificationMinutes
      ? 'A diferença entre o voo planejado e o realizado precisa ser justificada exatamente antes de finalizar.'
      : null;

  const editableWorkflow = ['rascunho', 'devolvido'].includes(
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
    finalizeReceipt,
    sendReceipt,
    packageMatchesAcceptedSync,
    canFinalize:
      navigator.onLine &&
      !coordinationInFlight &&
      !finalizeBlocker &&
      !justificationBlocker &&
      Boolean(rdv) &&
      rdv.status === 'rascunho' &&
      editableWorkflow &&
      packageMatchesAcceptedSync,
    canSend:
      navigator.onLine &&
      !coordinationInFlight &&
      !finalizeBlocker &&
      !sendBlocker &&
      Boolean(rdv) &&
      rdv.status === 'preenchimento_finalizado' &&
      sendableWorkflow,
    reason: sendBlocker || finalizeBlocker || justificationBlocker || null,
  };
}
async function refreshCoordinationControls() {
  refreshCanonicalPackageButton.disabled =
    !navigator.onLine || !vault?.isUnlocked() || !activePackageRecord || coordinationInFlight || completeSendInFlight;
  finalizeRdvServerButton.disabled = true;
  sendRdvCoordinationButton.disabled = true;
  completeSendRdvButton.disabled =
    !navigator.onLine ||
    !vault?.isUnlocked() ||
    !activePackageRecord ||
    !activeRdvDraft ||
    activePackageData()?.contract?.sync_supported !== true ||
    coordinationInFlight ||
    completeSendInFlight;
  setCoordinationReceipt('');

  if (!activePackageRecord || !vault?.isUnlocked()) {
    setCoordinationMessage('Abra um pacote de voo para avaliar o fechamento.', 'attention');
    return;
  }

  const state = await getCoordinationState();
  const rdv = state.rdv;
  if (!rdv) {
    setCoordinationMessage(
      'O servidor ainda não recebeu o lançamento deste voo. Transmita os dados e atualize o status.',
      'attention',
    );
    return;
  }

  if (rdv.workflow_status === 'enviado') {
    completeSendRdvButton.disabled = true;
    const localReceipt = await latestWorkflowReceiptForFlight(state.flightId, 'send_coordination');
    const confirmedAt =
      rdv.enviado_em ||
      localReceipt?.value?.server_result?.enviado_em ||
      localReceipt?.value?.updated_at_local ||
      null;
    setCoordinationMessage('Lançamento recebido pela Coordenação.', 'ok');
    updateOperationFlow('coordination');
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
    const latestBlocked = blocked.at(-1);
    const blockedSequence = Number(latestBlocked?.value?.command?.local_sequence || 0);
    const currentSequence = Number(activeRdvDraft?.local_sequence || operationalLocalSequence || 0);
    const lastError = latestBlocked?.value?.last_error || {};
    const detail = String(lastError.message || 'O servidor recusou a tentativa anterior.');
    const code = String(lastError.code || '').trim();
    if (currentSequence > blockedSequence) {
      setServerSyncStatus('Correções prontas');
      setRdvSyncMessage(
        'A tentativa anterior foi recusada: ' + detail +
          (code ? ' [' + code + ']' : '') +
          '. Há alterações posteriores salvas; envie novamente.',
        'attention',
      );
    } else {
      setServerSyncStatus('Ação necessária');
      setRdvSyncMessage(
        'Transmissão bloqueada: ' + detail +
          (code ? ' [' + code + ']' : '') +
          '. Corrija o dado indicado antes de enviar novamente.',
        'error',
      );
    }
  } else if (pending.length > 0) {
    setServerSyncStatus('Pendente de transmissão');
    setRdvSyncMessage(
      navigator.onLine
        ? (offlineFlightLocked
            ? 'Existe uma transmissão pendente. Use “Enviar informações do voo” quando quiser transmitir.'
            : 'Existe uma transmissão pendente. O Pilot App tentará reenviar de forma idempotente.')
        : 'Transmissão pendente preservada na outbox cifrada até a conexão voltar.',
      'attention',
    );
  } else if (activeRdvDraft?.sync_state === 'accepted_requires_refresh') {
    const syncedAt = String(activeRdvDraft?.synced_at || '');
    const preparedAt = String(activePackageRecord?.value?.prepared_at || '');
    const reconciled = Boolean(syncedAt && preparedAt && preparedAt > syncedAt);
    setServerSyncStatus('Transmitido');
    setRdvSyncMessage(
      reconciled
        ? 'Dados sincronizados com o AirTrust. O voo ainda precisa ser concluído e enviado à Coordenação.'
        : 'Receipt confirmado. Atualizando o pacote do voo para continuar com segurança.',
      'ok',
    );
    if (rdvSyncConfirmation) rdvSyncConfirmation.classList.toggle('hidden', !reconciled);
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
    updateOperationFlow('prepare');
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
      updateOperationFlow('offline');
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
  if (!packageData) return false;

  if (!hasTrustedPilotLeaseKeys()) {
    const message = 'Este voo ainda não pode ser preparado para uso offline neste dispositivo.';
    setLeaseMessage(message, 'error');
    setSessionMessage(message, 'error');
    return false;
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
    updateOperationFlow('offline');
    openLocalDraftButton.disabled = false;
    setLeaseMessage(
      'Lease verificado e salvo no tablet até ' + formatTimestamp(readBack.claims.valid_until) + '.',
      'ok',
    );
    await openOrSeedOperationalDraft(packageData, readBack);
    setSessionMessage('Voo aberto e pronto para preenchimento.', 'ok');
    return true;
  } catch (error) {
    const authFailure = error instanceof PilotOnlineRequestError && error.status === 401;
    const message =
      error instanceof Error ? error.message : 'Falha ao preparar o voo para preenchimento.';
    setLeaseMessage(message, 'error');
    setSessionMessage(
      authFailure ? 'Sessão online necessária para abrir este voo.' : message,
      'error',
      authFailure,
    );
    return false;
  } finally {
    prepareEditOfflineButton.disabled = !navigator.onLine || !hasTrustedPilotLeaseKeys();
  }
}

async function openExistingOperationalDraft() {
  const packageData = activePackageData();
  if (!packageData) return false;

  try {
    const existing = await verifyStoredLeaseForPackage(packageData);
    if (!existing?.verified) {
      throw new Error('Nenhum lease offline válido encontrado neste tablet.');
    }
    activeVerifiedLease = existing.verified;
    await openOrSeedOperationalDraft(packageData, existing.verified);
    setSessionMessage('Voo offline aberto neste tablet.', 'ok');
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Não foi possível abrir o voo salvo neste tablet.';
    setLeaseMessage(message, 'error');
    setSessionMessage(message, 'error');
    return false;
  }
}

async function reconcileAcceptedDraftWithFreshPackage(
  packageData,
  existingRdv,
  stageRecords,
) {
  const identity = assertPackageIdentity(packageData);
  const value = existingRdv?.value || {};
  if (value.sync_state !== 'accepted_requires_refresh') {
    return { rdvRecord: existingRdv, stageRecords };
  }

  if (String(value.source_package_id || '') === String(identity.packageId)) {
    throw new Error(
      'A transmissão foi confirmada, mas o pacote atualizado do voo ainda não está disponível. Toque em “Atualizar” e tente novamente.',
    );
  }

  const previousSequence = Math.max(
    Number(existingRdv?.localRevision || value.local_sequence || 0),
    ...stageRecords.map((record) =>
      Number(record.localRevision || record.value?.local_sequence || 0),
    ),
  );
  const snapshot = buildDraftSnapshot(packageData, previousSequence);

  // A transmissão aceita garante que não há edição local posterior (esse caso
  // é tratado como conflito em markDraftAcceptedByServer). O novo pacote é,
  // portanto, a fonte canônica para RDV/etapas. Mantemos a lista local de
  // abastecimentos para não degradar a experiência até que o builder passe a
  // hidratá-la diretamente do pacote.
  if (Array.isArray(value.fuelings)) {
    snapshot.rdv.fuelings = structuredClone(value.fuelings);
  }

  await vault.putJsonBatch([
    {
      storeName: 'rdv_drafts',
      id: snapshot.rdv.entity_local_id,
      value: snapshot.rdv,
      localRevision: previousSequence,
    },
    ...snapshot.stages.map((stage) => ({
      storeName: 'stage_drafts',
      id: stage.entity_local_id,
      value: stage,
      localRevision: previousSequence,
    })),
  ]);

  const canonicalStageIds = new Set(snapshot.stages.map((stage) => stage.entity_local_id));
  await Promise.all(
    stageRecords
      .filter((record) => !canonicalStageIds.has(record.id))
      .map((record) => vault.deleteJson('stage_drafts', record.id).catch(() => undefined)),
  );

  const rdvRecord = await vault.getJson('rdv_drafts', snapshot.rdv.entity_local_id);
  const refreshedStages = (await vault.listJson('stage_drafts')).filter(
    (record) =>
      Number(record.value?.flight_id) === identity.flightId &&
      String(record.value?.source_package_id) === identity.packageId,
  );
  if (!rdvRecord || refreshedStages.length === 0) {
    throw new Error('Falha ao reconciliar o rascunho transmitido com o pacote atualizado.');
  }

  return { rdvRecord, stageRecords: refreshedStages };
}

async function openOrSeedOperationalDraft(packageData, verifiedLease) {
  assertVerifiedLeaseAllowsDraft(packageData, verifiedLease);
  const identity = assertPackageIdentity(packageData);
  const rdvId = rdvDraftRecordId(identity.flightId);
  let existingRdv = await vault.getJson('rdv_drafts', rdvId);
  let stageRecords = (await vault.listJson('stage_drafts')).filter(
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
      const reconciled = await reconcileAcceptedDraftWithFreshPackage(
        packageData,
        existingRdv,
        stageRecords,
      );
      existingRdv = reconciled.rdvRecord;
      stageRecords = reconciled.stageRecords;
    }
    const reconciledValue = existingRdv.value;
    if (String(reconciledValue.source_package_id) !== identity.packageId) {
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

    activeRdvDraft = {
      ...reconciledValue,
      schema_version: Math.max(Number(reconciledValue.schema_version || 1), PILOT_DRAFT_SCHEMA_VERSION),
      common: { ...buildCommonFlightFields(packageData), ...(reconciledValue.common || {}) },
      flight_update: reconciledValue.flight_update || {},
      fuelings: Array.isArray(reconciledValue.fuelings) ? reconciledValue.fuelings : [],
      justifications: Array.isArray(reconciledValue.justifications)
        ? reconciledValue.justifications
        : (Array.isArray(packageData?.justificativas) ? packageData.justificativas : []).map((item) => ({
            local_id: crypto.randomUUID(),
            justificativa_codigo: String(item?.codigo || ''),
            minutos: item?.minutos == null ? '' : String(item.minutos),
            observacao: String(item?.observacao || ''),
          })),
    };
    activeStageDrafts = matchingStages.map((record) => ({
      ...record.value,
      schema_version: Math.max(
        Number(record.value?.schema_version || 1),
        PILOT_DRAFT_SCHEMA_VERSION,
      ),
      fields: {
        ...(record.value?.fields || {}),
        payload: record.value?.fields?.payload ?? '',
        unidade_payload: record.value?.fields?.unidade_payload || 'LB',
        combustivel_inicio: record.value?.fields?.combustivel_inicio ?? '',
        combustivel_fim: record.value?.fields?.combustivel_fim ?? '',
        unidade_combustivel: record.value?.fields?.unidade_combustivel || 'LB',
        peso_passageiros: record.value?.fields?.peso_passageiros ?? '',
        peso_bagagem: record.value?.fields?.peso_bagagem ?? '',
        peso_tripulacao: activeRdvDraft.common?.peso_tripulacao || '',
        peso_vazio: activeRdvDraft.common?.peso_vazio || '',
        peso_total: record.value?.fields?.peso_total ?? '',
        unidade_peso: activeRdvDraft.common?.unidade_peso || 'LB',
        observacoes: record.value?.fields?.observacoes ?? '',
        horario_motor_ligado: toInputTime(record.value?.fields?.horario_motor_ligado),
        horario_decolagem: toInputTime(record.value?.fields?.horario_decolagem),
        horario_pouso: toInputTime(record.value?.fields?.horario_pouso),
        horario_motor_desligado: toInputTime(record.value?.fields?.horario_motor_desligado),
      },
    }));
    applyStageContinuity(activeStageDrafts);
    operationalLocalSequence = Math.max(
      Number(existingRdv.localRevision || reconciledValue.local_sequence || 0),
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
    if (!persistedRdv) throw new Error('Falha ao criar o rascunho do voo no tablet.');

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
    applyStageContinuity(activeStageDrafts);
    operationalLocalSequence = 0;
    operationalNextSequence = 0;
  }

  applyCommonFieldsToStages();
  refreshAllStageDerivedTimes();
  activeRdvDraft.form = applySafeStageAggregates(activeRdvDraft.form, activeStageDrafts);
  await enterOfflineFlightMode(packageData);
  renderOperationalEditor();
  void refreshOutboxStatusForActiveFlight();
}

function localTimeNow() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

function nextOperationalSequence() {
  operationalNextSequence += 1;
  return operationalNextSequence;
}

function markOperationalPending() {
  rdvEditorSaveStatus.className = 'statusline attention';
  rdvEditorSaveStatus.textContent = 'Alterações locais pendentes…';
}

function fuelingRowIsEmpty(fueling) {
  return !String(fueling?.empresa_abastecimento_codigo || '').trim() &&
    !String(fueling?.numero_nota || '').trim() &&
    parseNumber(fueling?.litros_abastecidos) === null;
}

function validatePlanningJustifications(packageData, stageDrafts, justifications) {
  const errors = [];
  const requiredMinutes = requiredJustificationMinutes(packageData, stageDrafts);
  const rows = Array.isArray(justifications) ? justifications : [];
  if (requiredMinutes <= 0) return errors;

  const usedCodes = new Set();
  rows.forEach((item, index) => {
    const code = String(item?.justificativa_codigo || '').trim().toUpperCase();
    const minutes = Number(item?.minutos);
    if (!code) errors.push('Justificativa ' + (index + 1) + ': selecione o código.');
    else if (usedCodes.has(code)) errors.push('Justificativa ' + (index + 1) + ': código repetido.');
    else usedCodes.add(code);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      errors.push('Justificativa ' + (index + 1) + ': informe um tempo válido em minutos.');
    }
  });

  const assignedMinutes = totalJustificationMinutes(rows);
  if (assignedMinutes !== requiredMinutes) {
    errors.push(
      'As justificativas devem somar exatamente ' +
        String(requiredMinutes) +
        ' minuto(s) de diferença; informado: ' +
        String(assignedMinutes) +
        '.',
    );
  }
  return errors;
}

function refreshDraftValidationPresentation() {
  const packageData = activePackageData();
  if (!activeRdvDraft || !packageData) return;
  const rdvErrors = validateRdvForm(activeRdvDraft.form, packageData);
  const stageErrors = validateStageDrafts(activeStageDrafts);
  const supplementalErrors = [];
  for (const [index, fueling] of (activeRdvDraft.fuelings || []).entries()) {
    if (fuelingRowIsEmpty(fueling)) continue;
    if (!Number.isInteger(Number(fueling.etapa_numero)) || Number(fueling.etapa_numero) <= 0) supplementalErrors.push('Abastecimento ' + (index + 1) + ': selecione a etapa.');
    if (!String(fueling.empresa_abastecimento_codigo || '').trim()) supplementalErrors.push('Abastecimento ' + (index + 1) + ': selecione a empresa de abastecimento.');
    if (!String(fueling.numero_nota || '').trim()) supplementalErrors.push('Abastecimento ' + (index + 1) + ': informe o número da nota.');
    if (parseNumber(fueling.litros_abastecidos) === null) supplementalErrors.push('Abastecimento ' + (index + 1) + ': informe os litros abastecidos.');
  }
  supplementalErrors.push(
    ...validatePlanningJustifications(
      packageData,
      activeStageDrafts,
      activeRdvDraft.justifications,
    ),
  );
  const messages = [
    ...Object.values(rdvErrors),
    ...stageErrors,
    ...supplementalErrors,
  ].map((message) => String(message || '').trim()).filter(Boolean);

  const existing = rdvEditorCard.querySelector('#rdv-validation-summary');
  if (existing) existing.remove();

  if (messages.length === 0) return;
  const summary = document.createElement('div');
  summary.id = 'rdv-validation-summary';
  summary.className = 'statusline error';
  const title = document.createElement('strong');
  title.textContent = 'Antes de enviar, corrija:';
  const list = document.createElement('ul');
  list.className = 'validation-list';
  for (const message of messages) {
    const item = document.createElement('li');
    item.textContent = message;
    list.append(item);
  }
  summary.append(title, list);
  rdvSyncStatus.insertAdjacentElement('afterend', summary);
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
        updateOperationFlow(offlineFlightLocked ? 'saved' : (navigator.onLine ? 'pending' : 'saved'));
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
  if (!persistedRdv) throw new Error('Rascunho do voo não encontrado no tablet.');

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
      'As revisões locais do lançamento e das pernas não estão alinhadas. Salve novamente antes de transmitir.',
    );
  }

  const rdvErrors = validateRdvForm(persistedRdv.value.form, packageData);
  const stageErrors = validateStageDrafts(persistedStages.map((record) => record.value));
  const justificationErrors = validatePlanningJustifications(
    packageData,
    persistedStages.map((record) => record.value),
    persistedRdv.value.justifications,
  );
  if (Object.keys(rdvErrors).length > 0 || stageErrors.length > 0 || justificationErrors.length > 0) {
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

function isRecoverableAuthenticationSyncError(errorLike) {
  const status = Number(errorLike?.status || 0);
  const code = String(errorLike?.code || '').trim().toUpperCase();
  if (status !== 401) return false;
  // O comando offline continua válido: a sessão online pode expirar/revogar
  // durante horas de voo e deve poder ser retomada após um novo login.
  return !['USER_INACTIVE', 'TENANT_MISMATCH'].includes(code);
}

function isRetriableSyncError(error) {
  if (!(error instanceof PilotOnlineRequestError)) return true;
  if (isRecoverableAuthenticationSyncError(error)) return true;
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
        }, { allowDuringFlight: true });
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
        updateOperationFlow('synced');
        setRdvSyncMessage(
          'Dados sincronizados com o AirTrust. Reconciliando o pacote antes do envio à Coordenação…',
          'ok',
        );
        if (
          activeRdvDraft &&
          Number(activeRdvDraft.flight_id) === Number(command.flight_id)
        ) {
          const refreshed = await prepareFlightPackage(command.flight_id, { allowDuringFlight: true });
          if (refreshed) {
            setLeaseMessage('Dados sincronizados e pacote reconciliado com o servidor.', 'ok');
            if (rdvSyncConfirmation) rdvSyncConfirmation.classList.remove('hidden');
            await refreshCoordinationControls();
            coordinationStatus?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            setRdvSyncMessage(
              'Dados recebidos pelo servidor, mas não foi possível atualizar o pacote. Use “Atualizar status” antes de finalizar.',
              'attention',
            );
          }
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
    await prepareFlightPackage(flightId, { allowDuringFlight: true });
  } finally {
    coordinationInFlight = false;
    await refreshCoordinationControls();
  }
}

async function finalizeCanonicalRdv(options = {}) {
  if (coordinationInFlight) return false;
  const state = await getCoordinationState();
  if (!state.canFinalize || !state.rdv) {
    await refreshCoordinationControls();
    return false;
  }
  const expectedVersion = Number(state.rdv.versao);
  if (
    options.skipConfirm !== true &&
    !window.confirm(
      'Finalizar o lançamento deste voo? Depois disso os campos ficam bloqueados até eventual devolução pela Coordenação.',
    )
  ) {
    return false;
  }

  coordinationInFlight = true;
  let requestStarted = false;
  let confirmedResult = null;

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
      { allowDuringFlight: true },
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
    confirmedResult = updated;
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
  }

  if (confirmedResult) {
    setCoordinationMessage(
      'Preenchimento finalizado e confirmado pelo servidor. Atualizando pacote…',
      'ok',
    );
    try {
      const refreshed = await prepareFlightPackage(state.flightId, { allowDuringFlight: true });
      if (!refreshed) throw new Error('PACKAGE_REFRESH_FAILED');
    } catch (refreshError) {
      console.error('[Pilot Offline] Falha ao atualizar pacote após finalização confirmada:', refreshError);
      setCoordinationMessage(
        'Preenchimento confirmado pelo servidor. A atualização do pacote falhou; use “Atualizar do servidor” antes da próxima ação.',
        'attention',
      );
    }
  }

  coordinationInFlight = false;
  try {
    await refreshCoordinationControls();
  } catch (refreshError) {
    console.error('[Pilot Offline] Falha ao reconciliar controles de finalização:', refreshError);
  }
  return Boolean(confirmedResult);
}
async function sendCanonicalRdvToCoordination(options = {}) {
  if (coordinationInFlight) return false;
  const state = await getCoordinationState();
  if (!state.canSend || !state.rdv) {
    await refreshCoordinationControls();
    return false;
  }

  try {
    const alertsBody = await authenticatedGet(
      '/controle-voos/voos/' +
        encodeURIComponent(String(state.flightId)) +
        '/rdv/alertas',
      { allowDuringFlight: true },
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
      return false;
    }
  } catch (error) {
    setCoordinationMessage(
      error instanceof Error
        ? error.message
        : 'Não foi possível validar os alertas antes do envio.',
      'error',
    );
    return false;
  }

  const expectedVersion = Number(state.rdv.versao);
  if (
    options.skipConfirm !== true &&
    !window.confirm(
      'Enviar este lançamento para revisão da Coordenação? Confirme somente depois de revisar todas as pernas e dados do voo.',
    )
  ) {
    return false;
  }

  coordinationInFlight = true;
  let requestStarted = false;
  let confirmedResult = null;

  try {
    await persistWorkflowReceipt({
      flightId: state.flightId,
      action: 'send_coordination',
      expectedVersion,
      state: 'sending',
    });
    await refreshCoordinationControls();
    setCoordinationMessage('Enviando lançamento à Coordenação…', 'attention');

    requestStarted = true;
    const body = await authenticatedPost(
      '/controle-voos/voos/' +
        encodeURIComponent(String(state.flightId)) +
        '/rdv/enviar',
      { versao: expectedVersion },
      { allowDuringFlight: true },
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
    confirmedResult = updated;
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
  }

  let handoffSnapshot = null;
  if (confirmedResult) {
    handoffSnapshot = buildHandoffSuccessSnapshot(confirmedResult);
    setCoordinationMessage(
      'Recebimento pela Coordenação confirmado pelo servidor. Preparando confirmação…',
      'ok',
    );
    try {
      const refreshed = await prepareFlightPackage(state.flightId, { allowDuringFlight: true });
      if (!refreshed) throw new Error('PACKAGE_REFRESH_FAILED');
    } catch (refreshError) {
      console.error('[Pilot Offline] Falha ao atualizar pacote após handoff confirmado:', refreshError);
    }
    await exitOfflineFlightMode();
  }

  coordinationInFlight = false;
  if (handoffSnapshot) {
    showHandoffSuccess(handoffSnapshot);
    return true;
  }
  try {
    await refreshCoordinationControls();
  } catch (refreshError) {
    console.error('[Pilot Offline] Falha ao reconciliar controles de Coordenação:', refreshError);
  }
  return false;
}

async function completeAndSendCanonicalRdv() {
  if (completeSendInFlight || coordinationInFlight || operationalSyncInFlight) return;
  const packageData = activePackageData();
  const flightId = Number(packageData?.voo?.id || 0);
  if (!flightId || !navigator.onLine) {
    setCoordinationMessage('Conecte o tablet à internet antes de concluir e enviar o voo.', 'error');
    return;
  }
  if (
    !window.confirm(
      'Concluir e enviar este voo à Coordenação? O AirTrust vai sincronizar os dados, finalizar o RDV e confirmar o recebimento.',
    )
  ) {
    return;
  }

  completeSendInFlight = true;
  await refreshCoordinationControls();
  try {
    setCoordinationMessage('1/3 — Sincronizando os dados do voo…', 'attention');
    await flushOperationalSave();
    await queueCurrentDraftForSync();
    await prepareFlightPackage(flightId, { allowDuringFlight: true });

    let state = await getCoordinationState();
    if (state.rdv?.workflow_status === 'enviado') {
      const snapshot = buildHandoffSuccessSnapshot(state.rdv);
      await exitOfflineFlightMode();
      showHandoffSuccess(snapshot);
      return;
    }

    if (state.canFinalize) {
      setCoordinationMessage('2/3 — Finalizando o RDV…', 'attention');
      const finalized = await finalizeCanonicalRdv({ skipConfirm: true });
      if (!finalized) throw new Error('O servidor não confirmou a finalização do RDV.');
      await prepareFlightPackage(flightId, { allowDuringFlight: true });
      state = await getCoordinationState();
    }

    if (state.rdv?.status !== 'preenchimento_finalizado') {
      throw new Error(
        state.reason ||
          'Os dados foram sincronizados, mas o RDV ainda não pode ser finalizado. Revise os campos indicados.',
      );
    }

    if (!state.canSend) {
      await prepareFlightPackage(flightId, { allowDuringFlight: true });
      state = await getCoordinationState();
    }
    if (!state.canSend) {
      throw new Error(state.reason || 'O RDV foi finalizado, mas ainda não pode ser enviado à Coordenação.');
    }

    setCoordinationMessage('3/3 — Enviando à Coordenação…', 'attention');
    const sent = await sendCanonicalRdvToCoordination({ skipConfirm: true });
    if (!sent) throw new Error('O servidor não confirmou o recebimento pela Coordenação.');
  } catch (error) {
    setCoordinationMessage(
      error instanceof Error ? error.message : 'Não foi possível concluir o envio do voo.',
      'error',
    );
  } finally {
    completeSendInFlight = false;
    if (!handoffSuccessCard || handoffSuccessCard.classList.contains('hidden')) {
      await refreshCoordinationControls().catch(() => undefined);
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
    let unresolved = (await vault.listJson('outbox')).filter(
      (record) =>
        Number(record.value?.command?.flight_id) === state.identity.flightId &&
        ['pending', 'blocked'].includes(record.value?.status),
    );

    // Versões anteriores marcavam qualquer 401 como bloqueio permanente. Isso
    // deixava o RDV preso mesmo depois de um novo login. Reabre somente erros
    // de autenticação recuperáveis; validações permanentes continuam bloqueadas.
    for (const record of unresolved) {
      if (
        record.value?.status === 'blocked' &&
        isRecoverableAuthenticationSyncError(record.value?.last_error)
      ) {
        await storeOutboxAttempt(record, {
          status: 'pending',
          recovered_after_auth: true,
          recovered_at: new Date().toISOString(),
        });
      }
    }
    unresolved = (await vault.listJson('outbox')).filter(
      (record) =>
        Number(record.value?.command?.flight_id) === state.identity.flightId &&
        ['pending', 'blocked'].includes(record.value?.status),
    );
    let canCreateCommand = unresolved.length === 0;
    if (unresolved.length > 0) {
      const pending = unresolved.find((record) => record.value?.status === 'pending');
      if (pending) {
        setServerSyncStatus('Pendente de transmissão');
        setRdvSyncMessage(
          'Já existe uma operação pendente para este voo. Tentarei reconciliá-la antes de criar outra.',
          'attention',
        );
      } else {
        const blocked = unresolved.filter((record) => record.value?.status === 'blocked');
        const newestBlockedSequence = Math.max(
          0,
          ...blocked.map((record) => Number(record.value?.command?.local_sequence || 0)),
        );
        if (state.revision <= newestBlockedSequence) {
          const latest = blocked.at(-1);
          const lastError = latest?.value?.last_error || {};
          const detail = String(lastError.message || 'O servidor recusou a tentativa anterior.');
          const code = String(lastError.code || '').trim();
          throw new Error(
            'Transmissão bloqueada: ' + detail +
              (code ? ' [' + code + ']' : '') +
              '. Corrija o dado indicado; o AirTrust preservou o rascunho.',
          );
        }
        for (const record of blocked) {
          await storeOutboxAttempt(record, {
            status: 'superseded',
            superseded_at: new Date().toISOString(),
            superseded_by_local_sequence: state.revision,
          });
        }
        canCreateCommand = true;
      }
    }
    if (canCreateCommand) {
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
  const isDurationField = type === 'duration';
  if (type !== 'textarea') input.type = isDurationField ? 'text' : type;
  if (isDurationField) {
    input.inputMode = 'numeric';
    input.maxLength = 5;
    input.placeholder = 'HH:MM';
    input.autocomplete = 'off';
  } else if (inputMode) {
    input.inputMode = inputMode;
  }
  input.value = value ?? '';
  input.readOnly = readOnly || operationalSyncInFlight;
  input.addEventListener('input', () => {
    if (isDurationField) {
      const formatted = formatDurationDigits(input.value);
      if (formatted !== input.value) input.value = formatted;
    }
    if (onInput) onInput(input.value, input);
  });
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

function createEditorSelect({ label, value, options, onChange, disabled = false }) {
  const wrapper = document.createElement('label');
  const title = document.createElement('span');
  title.textContent = label;
  const select = document.createElement('select');
  select.disabled = operationalSyncInFlight || disabled;
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Selecione';
  select.append(blank);
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.code;
    node.textContent = option.label;
    select.append(node);
  }
  select.value = value || '';
  select.addEventListener('change', () => onChange(select.value));
  wrapper.append(title, select);
  return wrapper;
}

function normalizeJustificationSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function createJustificationPicker({ value, options, onChange, disabled = false }) {
  const wrapper = document.createElement('label');
  wrapper.className = 'justification-picker';
  const title = document.createElement('span');
  title.textContent = 'Justificativa';
  const input = document.createElement('input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = 'Busque por AA62, meteorologia, manutenção, pax...';
  input.disabled = operationalSyncInFlight || disabled;

  const selected = options.find((option) => option.code === value);
  input.value = selected ? selected.label : '';

  const selectedDetail = document.createElement('span');
  selectedDetail.className = 'justification-picker-selected-detail';
  selectedDetail.textContent = selected
    ? (selected.category || '') + (selected.description ? ' · ' + selected.description : '')
    : '';

  const results = document.createElement('div');
  results.className = 'justification-picker-results';
  results.hidden = true;

  const closeResults = () => {
    results.hidden = true;
    wrapper.classList.remove('open');
  };

  const choose = (option) => {
    input.value = option.label;
    selectedDetail.textContent =
      (option.category || '') + (option.description ? ' · ' + option.description : '');
    onChange(option.code);
    closeResults();
  };

  const renderResults = () => {
    const query = normalizeJustificationSearch(input.value);
    const matches = options.filter((option) => {
      if (!query) return true;
      const haystack = normalizeJustificationSearch(
        [option.code, option.name, option.category, option.description].filter(Boolean).join(' '),
      );
      return haystack.includes(query);
    });

    results.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'justification-picker-empty';
      empty.textContent = 'Nenhuma justificativa encontrada.';
      results.append(empty);
    } else {
      let lastCategory = null;
      for (const option of matches) {
        const category = option.category || 'Outros';
        if (category !== lastCategory) {
          const group = document.createElement('div');
          group.className = 'justification-picker-group';
          group.textContent = category;
          results.append(group);
          lastCategory = category;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'justification-picker-option';
        const code = document.createElement('span');
        code.className = 'justification-picker-code';
        code.textContent = option.code;
        const copy = document.createElement('span');
        copy.className = 'justification-picker-copy';
        const name = document.createElement('span');
        name.className = 'justification-picker-name';
        name.textContent = option.name;
        const categoryEl = document.createElement('span');
        categoryEl.className = 'justification-picker-category';
        categoryEl.textContent = category;
        copy.append(name, categoryEl);
        button.append(code, copy);
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          choose(option);
        });
        results.append(button);
      }
    }
    results.hidden = false;
    wrapper.classList.add('open');
  };

  input.addEventListener('focus', () => {
    input.select();
    renderResults();
  });
  input.addEventListener('input', renderResults);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeResults();
  });
  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      const exact = options.find((option) =>
        option.code === String(input.value || '').trim().toUpperCase(),
      );
      const current = options.find((option) => option.code === value);
      if (exact) choose(exact);
      else if (!results.matches(':hover')) {
        input.value = current ? current.label : '';
        closeResults();
      }
    }, 100);
  });

  wrapper.append(title, input, selectedDetail, results);
  return wrapper;
}

function updateOperationFlow(step) {
  if (!operationFlow) return;
  const mapped = {
    prepare: 0,
    offline: 1,
    saved: 1,
    pending: 2,
    synced: 3,
    coordination: 3,
  };
  const order = ['prepare', 'edit', 'send'];
  const current = mapped[step] ?? 0;
  for (const node of operationFlow.querySelectorAll('[data-step]')) {
    const index = order.indexOf(node.dataset.step);
    node.classList.remove('active', 'done', 'error');
    if (index < current) node.classList.add('done');
    else if (index === current && current < order.length) node.classList.add('active');
  }
}

function applyCommonFieldsToStages() {
  if (!activeRdvDraft) return;
  const common = activeRdvDraft.common || (activeRdvDraft.common = buildCommonFlightFields(activePackageData()));
  for (const stageDraft of activeStageDrafts) {
    const fields = stageDraft.fields || {};
    fields.peso_tripulacao = common.peso_tripulacao ?? '';
    fields.peso_vazio = common.peso_vazio ?? '';
    fields.unidade_peso = common.unidade_peso || 'LB';
  }
}

function convertWeightFieldValue(value, fromUnit, toUnit) {
  const converted = convertWeight(value, fromUnit, toUnit);
  return converted === null ? '' : String(converted);
}

function changeCommonWeightUnit(nextUnit) {
  if (!activeRdvDraft) return;
  const common = activeRdvDraft.common || (activeRdvDraft.common = buildCommonFlightFields(activePackageData()));
  const previousUnit = String(common.unidade_peso || 'LB').toUpperCase();
  const targetUnit = String(nextUnit || 'LB').toUpperCase();
  if (previousUnit === targetUnit) return;
  common.peso_tripulacao = convertWeightFieldValue(common.peso_tripulacao, previousUnit, targetUnit);
  common.peso_vazio = convertWeightFieldValue(common.peso_vazio, previousUnit, targetUnit);
  for (const stageDraft of activeStageDrafts) {
    const fields = stageDraft.fields || {};
    fields.peso_passageiros = convertWeightFieldValue(fields.peso_passageiros, previousUnit, targetUnit);
    fields.peso_bagagem = convertWeightFieldValue(fields.peso_bagagem, previousUnit, targetUnit);
    fields.unidade_peso = targetUnit;
  }
  common.unidade_peso = targetUnit;
  applyCommonFieldsToStages();
  refreshAllStageDerivedTimes();
}

function renderRdvFormFields() {
  const automaticSummary = document.getElementById('flight-auto-summary');
  if (automaticSummary instanceof HTMLDetailsElement) automaticSummary.open = true;
  rdvCoreFields.replaceChildren();
  rdvFormFields.replaceChildren();
  const form = activeRdvDraft.form;
  const packageData = activePackageData();
  const common = activeRdvDraft.common || (activeRdvDraft.common = buildCommonFlightFields(packageData));
  applyCommonFieldsToStages();
  refreshAllStageDerivedTimes();
  activeRdvDraft.form = applySafeStageAggregates(form, activeStageDrafts);

  const coordFlightNumber = String(packageData?.voo?.numero_voo || '').trim();
  rdvCoreFields.append(
    createEditorField({
      label: 'Número do voo',
      value: common.numero_voo || '',
      type: 'text',
      readOnly: Boolean(coordFlightNumber),
      note: coordFlightNumber ? 'Informado pela Coordenação.' : 'Preencha se a Coordenação não informou.',
      onInput: coordFlightNumber ? null : (value) => { common.numero_voo = value; scheduleOperationalSave(); },
      onBlur: coordFlightNumber ? null : () => void flushOperationalSave(),
    }),
    createEditorField({
      label: 'Relatório de voo',
      value: common.numero_db || '',
      type: 'text',
      note: 'Número do DB / relatório de voo informado pelo piloto.',
      onInput: (value) => { common.numero_db = value; scheduleOperationalSave(); },
      onBlur: () => void flushOperationalSave(),
    }),
    createEditorField({
      label: 'Peso da tripulação',
      value: common.peso_tripulacao || '',
      type: 'number',
      inputMode: 'decimal',
      note: 'Valor comum a todas as etapas.',
      onInput: (value) => {
        common.peso_tripulacao = value;
        applyCommonFieldsToStages();
        refreshAllStageDerivedTimes();
        scheduleOperationalSave();
        renderStageFields();
      },
      onBlur: () => void flushOperationalSave(),
    }),
    createEditorField({
      label: 'Peso vazio da aeronave',
      value: common.peso_vazio || '',
      type: 'number',
      inputMode: 'decimal',
      readOnly: true,
      note: 'Vem do cadastro da aeronave.',
    }),
    createEditorSelect({
      label: 'Unidade dos pesos',
      value: common.unidade_peso || 'LB',
      options: [{ code: 'LB', label: 'lb' }, { code: 'KG', label: 'kg' }],
      onChange: (value) => {
        changeCommonWeightUnit(value || 'LB');
        scheduleOperationalSave();
        renderOperationalEditor({ preserveScroll: true });
      },
    }),
    createEditorField({
      label: 'Ocorrências',
      value: form.ocorrencias || '',
      type: 'textarea',
      wide: true,
      onInput: (value) => { form.ocorrencias = value; scheduleOperationalSave(); },
      onBlur: () => void flushOperationalSave(),
    }),
    createEditorField({
      label: 'Divergências do planejado',
      value: form.divergencias || '',
      type: 'textarea',
      wide: true,
      onInput: (value) => { form.divergencias = value; scheduleOperationalSave(); },
      onBlur: () => void flushOperationalSave(),
    }),
  );

  const summaryFields = [
    ['Tempo de voo', activeRdvDraft.form.tempo_voo_total_hhmm || '—', 'Soma de decolagem → pouso em todas as etapas.'],
    ['Tempo total', activeRdvDraft.form.tempo_total_hhmm || '—', 'Soma de partida → corte em todas as etapas.'],
    ['Pousos', activeRdvDraft.form.numero_pousos || '0', 'Contado automaticamente pelas etapas com hora de pouso registrada.'],
  ];
  for (const [label, value, note] of summaryFields) {
    rdvFormFields.append(createEditorField({ label, value, type: 'text', readOnly: true, note }));
  }

  const plannedMinutes = plannedFlightMinutes(packageData);
  const realizedMinutes = realizedFlightMinutes(activeStageDrafts);
  const requiredMinutes = requiredJustificationMinutes(packageData, activeStageDrafts);
  const assignedMinutes = totalJustificationMinutes(activeRdvDraft.justifications);
  const justificationPanel = document.createElement('section');
  justificationPanel.className = 'justification-panel wide';
  const justificationHeading = document.createElement('div');
  justificationHeading.className = 'justification-heading';
  const justificationTitle = document.createElement('div');
  const headingStrong = document.createElement('strong');
  headingStrong.textContent = 'Justificativas do desvio';
  const headingNote = document.createElement('span');
  headingNote.className = 'field-note';
  headingNote.textContent =
    'Planejado ' + minutesToHhMm(plannedMinutes) +
    ' · Realizado ' + minutesToHhMm(realizedMinutes) +
    ' · Diferença a justificar ' + String(requiredMinutes) + ' min.';
  const sourceGuidance = document.createElement('span');
  sourceGuidance.className = 'field-note justification-guidance';
  sourceGuidance.textContent = 'Busque sempre a causa raiz do motivo do atraso.';
  justificationTitle.append(headingStrong, headingNote, sourceGuidance);
  const addJustification = document.createElement('button');
  addJustification.type = 'button';
  addJustification.className = 'secondary';
  addJustification.textContent = '+ Justificativa';
  addJustification.disabled = operationalSyncInFlight || requiredMinutes <= 0;
  addJustification.addEventListener('click', () => {
    activeRdvDraft.justifications = Array.isArray(activeRdvDraft.justifications)
      ? activeRdvDraft.justifications
      : [];
    activeRdvDraft.justifications.push({
      local_id: crypto.randomUUID(),
      justificativa_codigo: '',
      minutos: '',
      observacao: '',
    });
    scheduleOperationalSave();
    renderRdvFormFields();
  });
  justificationHeading.append(justificationTitle, addJustification);
  justificationPanel.append(justificationHeading);

  const status = document.createElement('div');
  const remaining = requiredMinutes - assignedMinutes;
  status.className = 'statusline ' + (requiredMinutes === assignedMinutes ? 'ok' : 'attention');
  status.textContent = requiredMinutes <= 0
    ? 'O tempo realizado não excede o planejado. Nenhuma justificativa é necessária.'
    : remaining === 0
      ? 'Justificativas fecham exatamente os ' + String(requiredMinutes) + ' minutos de diferença.'
      : remaining > 0
        ? 'Ainda faltam justificar ' + String(remaining) + ' minuto(s).'
        : 'As justificativas excedem a diferença em ' + String(Math.abs(remaining)) + ' minuto(s).';
  justificationPanel.append(status);

  const options = (Array.isArray(packageData?.catalogos?.justificativas_voo)
    ? packageData.catalogos.justificativas_voo
    : []).map((item) => ({
      code: String(item.codigo || ''),
      name: formatJustificationName(item.nome || item.codigo || ''),
      category: String(item.categoria || ''),
      description: String(item.descricao || ''),
      label: String(item.codigo || '') + ' — ' + formatJustificationName(item.nome || item.codigo || ''),
    }));

  const rows = document.createElement('div');
  rows.className = 'justification-rows';
  const justifications = Array.isArray(activeRdvDraft.justifications)
    ? activeRdvDraft.justifications
    : (activeRdvDraft.justifications = []);
  justifications.forEach((item, itemIndex) => {
    const row = document.createElement('div');
    row.className = 'justification-row';
    row.append(
      createJustificationPicker({
        value: item.justificativa_codigo || '',
        options,
        onChange: (value) => {
          item.justificativa_codigo = value;
          scheduleOperationalSave();
          void flushOperationalSave();
        },
        disabled: requiredMinutes <= 0,
      }),
      createEditorField({
        label: 'Tempo (min)',
        value: item.minutos || '',
        type: 'number',
        inputMode: 'numeric',
        onInput: (value) => {
          item.minutos = value;
          scheduleOperationalSave();
        },
        onBlur: () => {
          void flushOperationalSave();
          renderRdvFormFields();
          refreshDraftValidationPresentation();
        },
      }),
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary justification-remove';
    remove.textContent = 'Remover';
    remove.disabled = operationalSyncInFlight;
    remove.addEventListener('click', () => {
      justifications.splice(itemIndex, 1);
      scheduleOperationalSave();
      renderRdvFormFields();
    });
    row.append(remove);
    rows.append(row);
  });
  justificationPanel.append(rows);
  rdvFormFields.append(justificationPanel);
}

function minutesToHhMm(value) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  return String(Math.floor(total / 60)) + ':' + String(total % 60).padStart(2, '0');
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

function refreshStageDerivedTimes(stageDraft) {
  const fields = stageDraft?.fields || stageDraft || {};
  fields.tempo_decolagem_pouso = calcClockDurationHhMm(
    fields.horario_decolagem,
    fields.horario_pouso,
  );
  fields.tempo_total = calcClockDurationHhMm(
    fields.horario_motor_ligado,
    fields.horario_motor_desligado,
  );
  fields.starts = String(fields.horario_motor_ligado || '').trim() ? '1' : '';
  const totalWeight = calcStageTotalWeight(fields);
  fields.peso_total = totalWeight === null ? '' : String(totalWeight);
}

function refreshAllStageDerivedTimes() {
  applyStageContinuity(activeStageDrafts);
  for (const stageDraft of activeStageDrafts) refreshStageDerivedTimes(stageDraft);
}

function applyQuickTiming(stage, field, action) {
  const nowLocal = localTimeNow();
  stage.fields[field] = nowLocal;
  if (field === 'horario_motor_ligado') stage.continuity_start_derived = false;
  refreshAllStageDerivedTimes();
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

const STAGE_PALETTE = [
  { tab: '#1d4ed8', soft: '#eff6ff', border: '#93c5fd' },
  { tab: '#0f766e', soft: '#f0fdfa', border: '#99f6e4' },
  { tab: '#7c3aed', soft: '#f5f3ff', border: '#c4b5fd' },
  { tab: '#b45309', soft: '#fffbeb', border: '#fcd34d' },
  { tab: '#be123c', soft: '#fff1f2', border: '#fda4af' },
  { tab: '#0369a1', soft: '#f0f9ff', border: '#7dd3fc' },
];

function stagePalette(index) {
  return STAGE_PALETTE[index % STAGE_PALETTE.length];
}

function renderStageFields() {
  rdvStageFields.replaceChildren();
  if (activeStageDrafts.length === 0) return;

  activeStageTabIndex = Math.max(
    0,
    Math.min(activeStageTabIndex, activeStageDrafts.length - 1),
  );

  const tabs = document.createElement('div');
  tabs.className = 'stage-tabs';
  tabs.setAttribute('role', 'tablist');

  activeStageDrafts.forEach((draft, index) => {
    const fields = draft.fields || {};
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stage-tab' + (index === activeStageTabIndex ? ' active' : '');
    const palette = stagePalette(index);
    button.style.setProperty('--stage-tab-color', palette.tab);
    button.style.setProperty('--stage-soft-color', palette.soft);
    button.style.setProperty('--stage-border-color', palette.border);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', index === activeStageTabIndex ? 'true' : 'false');
    const routeLabel =
      String(fields.origem_icao || '').trim() && String(fields.destino_icao || '').trim()
        ? String(fields.origem_icao).trim() + ' → ' + String(fields.destino_icao).trim()
        : 'Etapa ' + String(fields.numero_etapa || index + 1);
    button.textContent = routeLabel;
    button.disabled = operationalSyncInFlight;
    button.addEventListener('click', () => {
      activeStageTabIndex = index;
      renderStageFields();
    });
    tabs.append(button);
  });
  rdvStageFields.append(tabs);

  const index = activeStageTabIndex;
  const stageDraft = activeStageDrafts[index];
  const fields = stageDraft.fields;
  const card = document.createElement('section');
  card.className = 'editor-stage stage-panel';
  const activePalette = stagePalette(index);
  card.style.setProperty('--stage-tab-color', activePalette.tab);
  card.style.setProperty('--stage-soft-color', activePalette.soft);
  card.style.setProperty('--stage-border-color', activePalette.border);

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
  quick.className = 'quick-time-grid';
  for (const [label, field] of [
    ['PARTIDA', 'horario_motor_ligado'],
    ['DECOLAGEM', 'horario_decolagem'],
    ['POUSO', 'horario_pouso'],
    ['CORTE', 'horario_motor_desligado'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = label;
    button.disabled = operationalSyncInFlight;
    button.addEventListener('click', () => applyQuickTiming(stageDraft, field, label));
    quick.append(button);
  }
  card.append(quick);

  refreshAllStageDerivedTimes();
  const grid = document.createElement('div');
  grid.className = 'editor-grid';
  const groundTime =
    index > 0
      ? calcClockDurationHhMm(fields.horario_motor_ligado, fields.horario_decolagem)
      : '';

  const stageFields = [
    ['Aeródromo de origem', 'origem_icao', 'text', null, false, false, null],
    ['Aeródromo de destino', 'destino_icao', 'text', null, false, false, null],
    ['Hora de partida', 'horario_motor_ligado', 'time', null, false, false, 'Acionamento / motor ligado'],
    ['Hora de decolagem', 'horario_decolagem', 'time', null, false, false, null],
    ['Hora de pouso', 'horario_pouso', 'time', null, false, false, null],
    ['Hora de corte', 'horario_motor_desligado', 'time', null, false, false, 'Motor desligado'],
    ['Tempo de voo', 'tempo_decolagem_pouso', 'text', null, true, false, 'Calculado: decolagem → pouso'],
    ['Tempo total', 'tempo_total', 'text', null, true, false, 'Calculado: partida → corte'],
    ['IFR (duração)', 'tempo_ifr', 'duration', 'numeric', false, false, 'Digite apenas os números, por exemplo 0130'],
    ['Noturno (duração)', 'tempo_noturno', 'duration', 'numeric', false, false, 'Digite apenas os números, por exemplo 0130'],
    ['Partidas', 'starts', 'number', 'numeric', true, false, 'Calculado automaticamente pela hora de partida'],
    ['Passageiros', 'pax', 'number', 'numeric', false, false, 'Quantidade de passageiros'],
    ['Peso dos passageiros', 'peso_passageiros', 'number', 'decimal', false, false, null],
    ['Peso da bagagem', 'peso_bagagem', 'number', 'decimal', false, false, null],
    ['Carga', 'payload', 'number', 'decimal', false, false, null],
    ['Peso total', 'peso_total', 'number', 'decimal', true, false, 'Calculado automaticamente'],
    [
      index === 0 ? 'Combustível inicial' : 'Combustível inicial',
      'combustivel_inicio',
      'number',
      'decimal',
      false,
      false,
      index > 0 ? 'Integrado ao combustível final da etapa anterior' : null,
    ],
    ['Combustível final', 'combustivel_fim', 'number', 'decimal', false, false, null],
    ['Observações da etapa', 'observacoes', 'textarea', null, false, true, null],
  ];

  for (const [label, key, type, inputMode, readOnly, wide, note] of stageFields) {
    const fieldNode = createEditorField({
      label,
      value: fields[key],
      type,
      inputMode,
      wide,
      readOnly,
      note,
      onInput: readOnly
        ? null
        : (value) => {
            fields[key] = value;
            if (key === 'horario_motor_ligado') stageDraft.continuity_start_derived = false;
            if (key === 'combustivel_inicio' && index > 0) {
              const previousFields = activeStageDrafts[index - 1]?.fields || {};
              previousFields.combustivel_fim = value;
              previousFields.unidade_combustivel = fields.unidade_combustivel || previousFields.unidade_combustivel;
            }
            refreshAllStageDerivedTimes();
            activeRdvDraft.form = applySafeStageAggregates(
              activeRdvDraft.form,
              activeStageDrafts,
            );
            scheduleOperationalSave();
          },
      onBlur: readOnly
        ? null
        : (value, input) => {
            if (key === 'tempo_ifr' || key === 'tempo_noturno') {
              const normalizedDuration = toDurationInput(value);
              if (normalizedDuration) {
                fields[key] = normalizedDuration;
                input.value = normalizedDuration;
              }
            }
            refreshAllStageDerivedTimes();
            activeRdvDraft.form = applySafeStageAggregates(
              activeRdvDraft.form,
              activeStageDrafts,
            );
            void flushOperationalSave();
            renderStageFields();
            renderRdvFormFields();
            refreshDraftValidationPresentation();
          },
    });
    if (readOnly) fieldNode.classList.add('derived-time');
    grid.append(fieldNode);
  }

  if (index > 0) {
    const groundField = createEditorField({
      label: 'Tempo no solo',
      value: groundTime,
      type: 'text',
      readOnly: true,
      note: 'Calculado entre o pouso anterior e a próxima decolagem',
    });
    groundField.classList.add('derived-time');
    grid.append(groundField);
  }

  grid.append(
    createEditorSelect({
      label: 'Unidade da carga',
      value: fields.unidade_payload || 'LB',
      options: [
        { code: 'KG', label: 'kg' },
        { code: 'LB', label: 'lb' },
      ],
      onChange: (value) => {
        fields.unidade_payload = value || 'LB';
        refreshAllStageDerivedTimes();
        activeRdvDraft.form = applySafeStageAggregates(activeRdvDraft.form, activeStageDrafts);
        scheduleOperationalSave();
        renderStageFields();
        renderRdvFormFields();
      },
    }),
    createEditorSelect({
      label: 'Unidade do combustível',
      value: fields.unidade_combustivel || 'LB',
      options: [
        { code: 'LB', label: 'lb' },
        { code: 'KG', label: 'kg' },
      ],
      disabled: index > 0,
      onChange: (value) => {
        fields.unidade_combustivel = value || 'LB';
        refreshAllStageDerivedTimes();
        scheduleOperationalSave();
        renderStageFields();
      },
    }),
  );

  card.append(grid);
  if (stageDraft.source_stage_id == null && activeStageDrafts.length > 1) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'secondary stage-delete';
    removeButton.textContent = 'Excluir esta etapa';
    removeButton.disabled = operationalSyncInFlight;
    removeButton.addEventListener('click', () => void removeOperationalStage(index));
    card.append(removeButton);
  }
  rdvStageFields.append(card);
}

async function removeOperationalStage(index) {
  if (!activeRdvDraft || operationalSyncInFlight) return;
  const removed = activeStageDrafts[index];
  if (!removed || removed.source_stage_id != null || activeStageDrafts.length <= 1) return;
  await flushOperationalSave();
  const removedNumber = Number(removed.fields?.numero_etapa || index + 1);
  activeStageDrafts.splice(index, 1);
  await vault.deleteJson('stage_drafts', removed.entity_local_id).catch(() => undefined);

  activeRdvDraft.fuelings = (activeRdvDraft.fuelings || [])
    .filter((fueling) => Number(fueling.etapa_numero) !== removedNumber)
    .map((fueling) => ({
      ...fueling,
      etapa_numero: Number(fueling.etapa_numero) > removedNumber
        ? Number(fueling.etapa_numero) - 1
        : Number(fueling.etapa_numero),
    }));
  activeStageDrafts.forEach((stage, stageIndex) => {
    if (stage.source_stage_id == null) stage.fields.numero_etapa = stageIndex + 1;
  });
  activeStageTabIndex = Math.max(0, Math.min(index - 1, activeStageDrafts.length - 1));
  applyCommonFieldsToStages();
  refreshAllStageDerivedTimes();
  activeRdvDraft.form = applySafeStageAggregates(activeRdvDraft.form, activeStageDrafts);
  scheduleOperationalSave();
  renderOperationalEditor({ preserveScroll: true });
}

function addOperationalStage() {
  if (!activeRdvDraft || operationalSyncInFlight) return;
  const previous = activeStageDrafts.at(-1)?.fields || {};
  const number = activeStageDrafts.length + 1;
  const packageData = activePackageData();
  const identity = assertPackageIdentity(packageData);
  const localId = 'local-stage-' + crypto.randomUUID();
  activeStageDrafts.push({
    schema_version: PILOT_DRAFT_SCHEMA_VERSION,
    entity_type: 'stage_draft',
    entity_local_id: 'flight:' + identity.flightId + ':stage:' + localId,
    flight_id: identity.flightId,
    tenant_id: identity.tenantId,
    user_id: identity.userId,
    source_package_id: identity.packageId,
    source_stage_id: null,
    source_stage_updated_at: null,
    local_sequence: operationalNextSequence,
    updated_at_claimed: new Date().toISOString(),
    continuity_start_derived: Boolean(previous.horario_pouso && !previous.horario_motor_desligado),
    fields: {
      source_stage_id: null, local_id: localId, numero_etapa: number,
      origem_icao: previous.destino_icao || '', destino_icao: '',
      horario_motor_ligado: previous.horario_pouso && !previous.horario_motor_desligado ? previous.horario_pouso : '', horario_decolagem: '', horario_pouso: '', horario_motor_desligado: '',
      tempo_decolagem_pouso: '', tempo_total: '', tempo_ifr: '', tempo_noturno: '',
      pousos_diurnos: '', pousos_noturnos: '', starts: '', pax: '', payload: '', unidade_payload: previous.unidade_payload || 'LB',
      combustivel_inicio: previous.combustivel_fim || '', combustivel_fim: '', unidade_combustivel: previous.unidade_combustivel || 'LB',
      peso_passageiros: '', peso_bagagem: '', peso_tripulacao: activeRdvDraft.common?.peso_tripulacao || '',
      peso_vazio: activeRdvDraft.common?.peso_vazio || '',
      peso_total: '', unidade_peso: activeRdvDraft.common?.unidade_peso || 'LB',
      observacoes: '',
    },
  });
  activeStageTabIndex = activeStageDrafts.length - 1;
  refreshAllStageDerivedTimes();
  scheduleOperationalSave();
  renderOperationalEditor({ preserveScroll: true });
}

function addOperationalFueling() {
  if (!activeRdvDraft || operationalSyncInFlight) return;
  activeRdvDraft.fuelings = Array.isArray(activeRdvDraft.fuelings) ? activeRdvDraft.fuelings : [];
  const activeStage = activeStageDrafts[activeStageTabIndex]?.fields || {};
  activeRdvDraft.fuelings.push({
    local_id: crypto.randomUUID(),
    hora: localTimeNow(),
    etapa_numero: Number(activeStage.numero_etapa || activeStageTabIndex + 1),
    empresa_abastecimento_codigo: '',
    numero_nota: '',
    litros_abastecidos: '',
  });
  scheduleOperationalSave();
  renderOperationalEditor({ preserveScroll: true });
}

function renderFuelingFields() {
  rdvFuelingFields.replaceChildren();
  const fuelings = Array.isArray(activeRdvDraft.fuelings) ? activeRdvDraft.fuelings : [];
  fuelings.forEach((fueling, index) => {
    const card = document.createElement('section');
    card.className = 'editor-stage';
    const heading = document.createElement('h3');
    heading.textContent = 'Nota de abastecimento ' + String(index + 1);
    card.append(heading);
    const grid = document.createElement('div');
    grid.className = 'editor-grid';
    grid.append(
      createEditorSelect({
        label: 'Etapa',
        value: String(fueling.etapa_numero || ''),
        options: activeStageDrafts.map((stage, stageIndex) => ({
          code: String(stage.fields?.numero_etapa || stageIndex + 1),
          label: 'Etapa ' + String(stage.fields?.numero_etapa || stageIndex + 1) + ' · ' + displayText(stage.fields?.origem_icao) + ' → ' + displayText(stage.fields?.destino_icao),
        })),
        onChange: (value) => {
          fueling.etapa_numero = Number(value || 0);
          scheduleOperationalSave();
          refreshDraftValidationPresentation();
        },
      }),
      createEditorSelect({
        label: 'Empresa de abastecimento',
        value: fueling.empresa_abastecimento_codigo || '',
        options: pilotFuelingCompanyOptions(activePackageData()),
        onChange: (value) => {
          fueling.empresa_abastecimento_codigo = value;
          scheduleOperationalSave();
          refreshDraftValidationPresentation();
        },
      }),
    );
    for (const [label, key, type, inputMode] of [
      ['Número da nota', 'numero_nota', 'text', null],
      ['Litros abastecidos', 'litros_abastecidos', 'number', 'decimal'],
    ]) {
      grid.append(createEditorField({
        label, value: fueling[key], type, inputMode,
        onInput: (value) => { fueling[key] = value; scheduleOperationalSave(); },
        onBlur: () => void flushOperationalSave(),
      }));
    }
    card.append(grid);
    rdvFuelingFields.append(card);
  });
}

function renderOperationalEditor(options = {}) {
  if (!activeRdvDraft || !activeVerifiedLease || !activePackageRecord) return;
  handoffSuccessCard?.classList.add('hidden');
  const scrollY = window.scrollY;
  const packageData = activePackageData();
  const voo = packageData.voo;

  rdvEditorTitle.textContent = 'Preenchimento do voo — ' + displayText(voo.prefixo);
  rdvEditorSubtitle.textContent =
    formatDate(voo.data_programacao) +
    ' · preenchimento salvo automaticamente neste tablet';
  rdvLeaseUntilLabel.textContent = formatTimestamp(
    activeVerifiedLease.claims.valid_until,
  );
  rdvLocalSequenceLabel.textContent = String(operationalLocalSequence);

  renderRdvFormFields();
  renderStageFields();
  renderFuelingFields();
  updateOperationFlow(operationalLocalSequence > 0 ? (offlineFlightLocked ? 'saved' : (navigator.onLine ? 'pending' : 'saved')) : 'offline');
  refreshDraftValidationPresentation();
  setFlightSelectionVisible(false);
  flightDetailCard.classList.add('hidden');
  rdvEditorCard.classList.remove('hidden');
  updateSyncButtonState();
  void refreshOutboxStatusForActiveFlight();
  if (options.preserveScroll) window.scrollTo({ top: scrollY });
  else rdvEditorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeOperationalEditor() {
  activeStageTabIndex = 0;
  rdvEditorCard.classList.add('hidden');
  setFlightSelectionVisible(true);
  rdvCoreFields.replaceChildren();
  rdvFormFields.replaceChildren();
  rdvStageFields.replaceChildren();
  rdvFuelingFields.replaceChildren();
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

function openPackageRecord(record, initialWorkspaceTab = 'summary') {
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
  renderPilotWorkspace(pilotWorkspaceView, packageData, initialWorkspaceTab, { openFlightDocument });

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

  appendSectionTitle(flightDetail, 'Registro operacional do voo');
  const rdv = packageData.rdv;
  appendInfoGrid(flightDetail, [
    ['Número', rdv?.numero],
    ['Status', rdv?.status],
    ['Fluxo', rdv?.workflow_status],
    ['Versão', rdv?.versao],
    ['POB', rdv?.pob],
    ['Carga', rdv?.carga_kg],
  ]);

  flightDetailCard.classList.add('hidden');
  void refreshLeaseControls(record);
  void refreshCoordinationControls();
}

function closePackageDetail() {
  handoffSuccessCard?.classList.add('hidden');
  closeOperationalEditor();
  activePackageRecord = null;
  activeVerifiedLease = null;
  flightDetailCard.classList.add('hidden');
  flightDetail.replaceChildren();
  pilotWorkspaceView.replaceChildren();
  prepareEditOfflineButton.disabled = true;
  openLocalDraftButton.disabled = true;
  setLeaseMessage('Abra um pacote de voo para avaliar o lease offline.', 'attention');
  refreshCanonicalPackageButton.disabled = true;
  finalizeRdvServerButton.disabled = true;
  sendRdvCoordinationButton.disabled = true;
  completeSendRdvButton.disabled = true;
  setCoordinationMessage('Abra um pacote de voo para avaliar o fechamento.', 'attention');
  setCoordinationReceipt('');
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

  workspace.classList.remove('hidden');
  window.__AIRTRUST_PILOT_APP_READY__ = true;
  window.dispatchEvent(new Event('airtrust:pilot-app-ready'));
  await loadCachedPackages();
  await updateStorageEstimate();
  const restoredOfflineFlight = await restoreActiveOfflineFlight();
  if (!restoredOfflineFlight) await loadOnlineFlights();
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


window.addEventListener('online', () => {
  setConnectivity();
  if (offlineFlightLocked) {
    updateSyncButtonState();
    setSessionMessage('Modo voo offline mantido. O sinal voltou, mas nenhuma conexão automática será feita.', 'ok');
    return;
  }
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
  if (offlineFlightLocked) {
    updateSyncButtonState();
    setSessionMessage('Modo voo offline mantido. Continue preenchendo normalmente.', 'ok');
    return;
  }
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
authorizedFlightDate?.addEventListener('change', () => {
  flightDateManuallySelected = true;
  setSelectedFlightDate(authorizedFlightDate.value);
});
flightDatePrevButton?.addEventListener('click', () => {
  flightDateManuallySelected = true;
  shiftSelectedFlightDate(-1);
});
flightDateTodayButton?.addEventListener('click', () => {
  flightDateManuallySelected = true;
  setSelectedFlightDate(localDateKey());
});
flightDateNextButton?.addEventListener('click', () => {
  flightDateManuallySelected = true;
  shiftSelectedFlightDate(1);
});
refreshOnlineButton.addEventListener('click', () => {
  flightDateManuallySelected = false;
  void loadOnlineFlights();
});
prepareEditOfflineButton.addEventListener('click', () => void prepareOfflineEditing());
openLocalDraftButton.addEventListener('click', () => void openExistingOperationalDraft());
syncRdvButton.addEventListener('click', () => void queueCurrentDraftForSync());
addStageButton.addEventListener('click', addOperationalStage);
addFuelingButton.addEventListener('click', addOperationalFueling);
refreshCanonicalPackageButton.addEventListener('click', () =>
  void refreshCanonicalPackageForActiveFlight(),
);
finalizeRdvServerButton.addEventListener('click', () => void finalizeCanonicalRdv());
sendRdvCoordinationButton.addEventListener('click', () =>
  void sendCanonicalRdvToCoordination(),
);
completeSendRdvButton.addEventListener('click', () => void completeAndSendCanonicalRdv());
closeRdvEditorButton.addEventListener('click', () => void flushOperationalSave().then(async () => {
  await exitOfflineFlightMode();
  closeOperationalEditor();
  setFlightSelectionVisible(true);
  if (navigator.onLine) await loadOnlineFlights();
}));
handoffSuccessBackButton?.addEventListener('click', async () => {
  handoffSuccessCard.classList.add('hidden');
  closePackageDetail();
  if (navigator.onLine) await loadOnlineFlights();
  setSessionMessage(
    'Voo enviado com sucesso à Coordenação. O recebimento foi confirmado pelo servidor.',
    'ok',
  );
});
closeDetailButton.addEventListener('click', closePackageDetail);
draftInput.addEventListener('input', scheduleDiagnosticSave);
draftInput.addEventListener('blur', () => void flushDiagnosticSave());
saveNowButton.addEventListener('click', () => void flushDiagnosticSave());
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

async function bootstrapPilotApp() {
  try {
    if (!offlineFlightLockMarkerActive()) await registerPilotServiceWorker();
    vault = await PilotVault.open();
    const vaultOpenState = await vault.openAutomatically();
    if (vaultOpenState.status !== 'ready') {
      throw new Error('Falha ao preparar armazenamento offline automático.');
    }
    await openWorkspace();
  } catch (error) {
    console.error('[Pilot Offline] Falha ao iniciar Pilot App:', error);
    workspace.classList.remove('hidden');
    const message =
      error instanceof Error ? error.message : 'Falha desconhecida ao iniciar o Pilot App.';
    setSessionMessage('Não foi possível iniciar o Pilot App: ' + message, 'error');
  }
}

void bootstrapPilotApp();
