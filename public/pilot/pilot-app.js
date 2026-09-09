import { PilotVault } from '/pilot/pilot-vault.js';

const DRAFT_ID = 'phase1-synthetic-rdv-draft';
const SAVE_DELAY_MS = 180;

const connectivity = document.querySelector('#connectivity');
const unlockCard = document.querySelector('#unlock-card');
const unlockTitle = document.querySelector('#unlock-title');
const unlockHelp = document.querySelector('#unlock-help');
const pinInput = document.querySelector('#pin');
const pinConfirmInput = document.querySelector('#pin-confirm');
const confirmWrap = document.querySelector('#confirm-wrap');
const unlockButton = document.querySelector('#unlock-button');
const unlockStatus = document.querySelector('#unlock-status');
const editorCard = document.querySelector('#editor-card');
const draftInput = document.querySelector('#draft');
const saveStatus = document.querySelector('#save-status');
const revisionLabel = document.querySelector('#revision');
const lastSavedLabel = document.querySelector('#last-saved');
const storageLabel = document.querySelector('#storage');
const saveNowButton = document.querySelector('#save-now');
const lockButton = document.querySelector('#lock');

let vault;
let provisioned = false;
let localRevision = 0;
let saveTimer = null;
let saveChain = Promise.resolve();

function setConnectivity() {
  const online = navigator.onLine;
  connectivity.className = 'pill ' + (online ? 'ok' : 'attention');
  connectivity.innerHTML =
    '<span class="dot"></span><span>' +
    (online ? 'ONLINE' : 'OFFLINE — operação local ativa') +
    '</span>';
}

function formatTimestamp(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
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
      // Readiness final tratará persistência como capacidade, nunca como garantia.
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

function renderProvisioningState() {
  unlockTitle.textContent = provisioned ? 'Desbloquear dados offline' : 'Preparar armazenamento offline';
  unlockHelp.textContent = provisioned
    ? 'Informe o PIN offline configurado neste tablet.'
    : 'Crie um PIN local para proteger o rascunho armazenado neste tablet.';
  confirmWrap.classList.toggle('hidden', provisioned);
  unlockButton.textContent = provisioned ? 'Desbloquear' : 'Preparar tablet';
}

async function openEditor() {
  await requestPersistentStorage();
  const stored = await vault.getJson('rdv_drafts', DRAFT_ID);
  if (stored) {
    draftInput.value = String(stored.value?.observacoes || '');
    localRevision = stored.localRevision;
    revisionLabel.textContent = String(localRevision);
    lastSavedLabel.textContent = formatTimestamp(stored.updatedAt);
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
  editorCard.classList.remove('hidden');
  pinInput.value = '';
  pinConfirmInput.value = '';
  await updateStorageEstimate();
  draftInput.focus();
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
    unlockStatus.textContent = 'Armazenamento offline pronto.';
    await openEditor();
  } catch (error) {
    unlockStatus.className = 'statusline error';
    unlockStatus.textContent = error instanceof Error ? error.message : 'Falha ao abrir armazenamento offline.';
  } finally {
    unlockButton.disabled = false;
  }
}

function markPending() {
  saveStatus.className = 'statusline attention';
  saveStatus.textContent = 'Alterações locais pendentes…';
}

function enqueueSave(snapshot) {
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
      console.error('[Pilot Offline] Falha ao persistir rascunho:', error);
      saveStatus.className = 'statusline error';
      saveStatus.textContent = 'Falha ao salvar no tablet. Não continue sem revisar.';
    });
  return saveChain;
}

function scheduleSave() {
  markPending();
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void enqueueSave(draftInput.value);
  }, SAVE_DELAY_MS);
}

function flushSave() {
  if (!vault?.isUnlocked()) return Promise.resolve();
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  return enqueueSave(draftInput.value);
}

function lockVault() {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  vault.lock();
  editorCard.classList.add('hidden');
  unlockCard.classList.remove('hidden');
  unlockStatus.textContent = '';
  renderProvisioningState();
  pinInput.focus();
}

window.addEventListener('online', setConnectivity);
window.addEventListener('offline', setConnectivity);
draftInput.addEventListener('input', scheduleSave);
draftInput.addEventListener('blur', () => void flushSave());
saveNowButton.addEventListener('click', () => void flushSave());
lockButton.addEventListener('click', lockVault);
unlockButton.addEventListener('click', () => void handleUnlock());
pinInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && provisioned) void handleUnlock();
});
window.addEventListener('pagehide', () => {
  if (saveTimer !== null && vault?.isUnlocked()) {
    void flushSave();
  }
});

setConnectivity();
await registerPilotServiceWorker();
vault = await PilotVault.open();
provisioned = await vault.isProvisioned();
renderProvisioningState();
await updateStorageEstimate();
