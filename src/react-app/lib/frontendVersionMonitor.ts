import {
  fetchServedFrontendVersion,
  readServedFrontendVersionFromDocument,
} from '@/react-app/config/deployment';
import { isReloadProtectedInteractivePath } from '@/react-app/lib/reloadProtection';

// Runtime update notices do not alter credentials, offline caches, or page state.
 // A notice is retained until this tab is voluntarily refreshed.
let pendingFrontendVersion: string | null = null;
const frontendUpdateListeners = new Set<(version: string) => void>();

export function getPendingFrontendUpdate(): string | null {
  return pendingFrontendVersion;
}

export function onFrontendUpdateAvailable(listener: (version: string) => void): () => void {
  frontendUpdateListeners.add(listener);
  if (pendingFrontendVersion !== null) listener(pendingFrontendVersion);
  return () => frontendUpdateListeners.delete(listener);
}

function announceFrontendUpdate(version: string): void {
  pendingFrontendVersion = version;
  for (const listener of frontendUpdateListeners) listener(version);
}

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const LMS_PLAYER_PATH = /^\/lms\/player\//;

type MonitorWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval' | 'location'>;
type MonitorDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener' | 'querySelector'>;

interface FrontendVersionMonitorDeps {
  windowApi?: MonitorWindow;
  documentApi?: MonitorDocument;
  fetchVersion?: () => Promise<string | null>;
  readCurrentVersion?: () => string | null;
  pollIntervalMs?: number;
}

function shouldSkipAutomaticRefresh(pathname: string): boolean {
  return LMS_PLAYER_PATH.test(pathname) || isReloadProtectedInteractivePath(pathname);
}

export function installFrontendVersionMonitor(deps: FrontendVersionMonitorDeps = {}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;

  const windowApi = deps.windowApi ?? window;
  const documentApi = deps.documentApi ?? document;
  const fetchVersion = deps.fetchVersion ?? (() => fetchServedFrontendVersion());
  const readCurrentVersion = deps.readCurrentVersion ?? (() => readServedFrontendVersionFromDocument());
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let checking = false;
  let lastAnnouncedVersion: string | null = null;

  const checkForUpdate = async () => {
    if (checking || shouldSkipAutomaticRefresh(windowApi.location.pathname)) return;
    checking = true;
    try {
      const currentVersion = readCurrentVersion();
      const servedVersion = await fetchVersion();
      if (!currentVersion || !servedVersion || currentVersion === servedVersion) return;

      if (lastAnnouncedVersion === servedVersion) return;
      lastAnnouncedVersion = servedVersion;
      console.info('[version] Nova versão disponível; aguardando ação do usuário', {
        currentVersion,
        servedVersion,
      });
      announceFrontendUpdate(servedVersion);
    } catch (error) {
      console.warn('[version] Falha ao verificar atualização do frontend:', error);
    } finally {
      checking = false;
    }
  };

  const onFocus = () => void checkForUpdate();
  const onVisibilityChange = () => {
    if (documentApi.visibilityState === 'visible') void checkForUpdate();
  };

  windowApi.addEventListener('focus', onFocus);
  documentApi.addEventListener('visibilitychange', onVisibilityChange);
  const intervalId = windowApi.setInterval(() => void checkForUpdate(), pollIntervalMs);

  // Primeira verificação logo após o bootstrap para recuperar abas antigas assim
  // que elas carregarem esta versão do runtime.
  void checkForUpdate();

  return () => {
    windowApi.removeEventListener('focus', onFocus);
    documentApi.removeEventListener('visibilitychange', onVisibilityChange);
    windowApi.clearInterval(intervalId);
  };
}

export { shouldSkipAutomaticRefresh };
