import { PilotVault } from '/pilot/pilot-vault.js';

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

let vault;
let provisioned = false;
let localRevision = 0;
let saveTimer = null;
let saveChain = Promise.resolve();
let cachedPackageRecords = [];
let onlineFlightRecords = [];

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
  flightDetailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePackageDetail() {
  flightDetailCard.classList.add('hidden');
  flightDetail.replaceChildren();
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

function lockVault() {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  vault.lock();
  cachedPackageRecords = [];
  onlineFlightRecords = [];
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
});
window.addEventListener('offline', () => {
  setConnectivity();
  if (vault?.isUnlocked()) {
    onlineFlightRecords = [];
    renderOnlineFlights();
    setSessionMessage('Offline — mostrando apenas pacotes cifrados já armazenados.', 'attention');
  }
});
refreshOnlineButton.addEventListener('click', () => void loadOnlineFlights());
closeDetailButton.addEventListener('click', closePackageDetail);
draftInput.addEventListener('input', scheduleDiagnosticSave);
draftInput.addEventListener('blur', () => void flushDiagnosticSave());
saveNowButton.addEventListener('click', () => void flushDiagnosticSave());
lockButton.addEventListener('click', lockVault);
unlockButton.addEventListener('click', () => void handleUnlock());
pinInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && provisioned) void handleUnlock();
});
window.addEventListener('pagehide', () => {
  if (saveTimer !== null && vault?.isUnlocked()) void flushDiagnosticSave();
});

setConnectivity();
await registerPilotServiceWorker();
vault = await PilotVault.open();
provisioned = await vault.isProvisioned();
renderProvisioningState();
await updateStorageEstimate();
