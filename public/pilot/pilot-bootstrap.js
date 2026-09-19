const PILOT_SHELL_RECOVERY_KEY = 'airtrust_pilot_shell_recovery_v17';
const PILOT_CACHE_PREFIX = 'airtrust-pilot-shell-';
const connectivity = document.querySelector('#connectivity');
const PILOT_OFFLINE_FLIGHT_LOCK_KEY = 'airtrust_pilot_offline_flight_locked_v1';

function flightLockMarkerActive() {
  try { return localStorage.getItem(PILOT_OFFLINE_FLIGHT_LOCK_KEY) === '1'; } catch { return false; }
}

function renderConnectivity() {
  if (!connectivity) return;
  const online = navigator.onLine;
  if (flightLockMarkerActive()) {
    connectivity.className = 'pill attention';
    connectivity.replaceChildren();
    const dot = document.createElement('span'); dot.className = 'dot';
    const text = document.createElement('span');
    text.textContent = online ? 'MODO VOO OFFLINE — sinal ignorado' : 'MODO VOO OFFLINE — sem sinal';
    connectivity.append(dot, text);
    return;
  }
  connectivity.className = 'pill ' + (online ? 'ok' : 'attention');
  connectivity.replaceChildren();

  const dot = document.createElement('span');
  dot.className = 'dot';
  const text = document.createElement('span');
  text.textContent = online ? 'ONLINE' : 'OFFLINE — operação local ativa';
  connectivity.append(dot, text);
}

function setBootstrapFailure(message) {
  if (!connectivity) return;
  connectivity.className = 'pill error';
  connectivity.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'dot';
  const text = document.createElement('span');
  text.textContent = message;
  connectivity.append(dot, text);
}

function clearRecoveryFlag() {
  try {
    sessionStorage.removeItem(PILOT_SHELL_RECOVERY_KEY);
  } catch {}
}

async function requestServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration('/pilot/')) ||
      (await navigator.serviceWorker.register('/pilot/pilot-sw.js', {
        scope: '/pilot/',
        updateViaCache: 'none',
      }));
    await registration.update();
  } catch (error) {
    console.warn('[Pilot Bootstrap] Falha ao atualizar Service Worker:', error);
  }
}

async function recoverStaleShell() {
  if (window.__AIRTRUST_PILOT_APP_READY__ === true) return;
  if (flightLockMarkerActive()) {
    setBootstrapFailure('MODO VOO OFFLINE — aguardando rascunho local');
    return;
  }
  if (!navigator.onLine) {
    setBootstrapFailure('OFFLINE — abra um voo já preparado neste tablet');
    return;
  }

  let alreadyRecovered = false;
  try {
    alreadyRecovered = sessionStorage.getItem(PILOT_SHELL_RECOVERY_KEY) === '1';
  } catch {}

  if (alreadyRecovered) {
    setBootstrapFailure('Falha ao carregar Pilot App — recarregue a página');
    return;
  }

  try {
    sessionStorage.setItem(PILOT_SHELL_RECOVERY_KEY, '1');
  } catch {}

  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(PILOT_CACHE_PREFIX))
          .map((name) => caches.delete(name)),
      );
    }
  } finally {
    window.location.reload();
  }
}

renderConnectivity();
window.addEventListener('online', renderConnectivity);
window.addEventListener('offline', renderConnectivity);
window.addEventListener('airtrust:pilot-app-ready', clearRecoveryFlag, { once: true });
if (!flightLockMarkerActive()) void requestServiceWorkerUpdate();
window.setTimeout(() => void recoverStaleShell(), 8000);
