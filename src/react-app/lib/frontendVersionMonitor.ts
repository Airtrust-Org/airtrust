import {
  fetchServedFrontendVersion,
  readServedFrontendVersionFromDocument,
} from '@/react-app/config/deployment';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const LMS_PLAYER_PATH = /^\/lms\/player\//;

type MonitorWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval' | 'location'>;
type MonitorDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener' | 'querySelector'>;

interface FrontendVersionMonitorDeps {
  windowApi?: MonitorWindow;
  documentApi?: MonitorDocument;
  fetchVersion?: () => Promise<string | null>;
  readCurrentVersion?: () => string | null;
  refresh?: () => Promise<void>;
  pollIntervalMs?: number;
}

function shouldSkipAutomaticRefresh(pathname: string): boolean {
  return LMS_PLAYER_PATH.test(pathname);
}

export function installFrontendVersionMonitor(deps: FrontendVersionMonitorDeps = {}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;

  const windowApi = deps.windowApi ?? window;
  const documentApi = deps.documentApi ?? document;
  const fetchVersion = deps.fetchVersion ?? (() => fetchServedFrontendVersion());
  const readCurrentVersion = deps.readCurrentVersion ?? (() => readServedFrontendVersionFromDocument());
  const refresh = deps.refresh ?? hardRefreshApp;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  if (shouldSkipAutomaticRefresh(windowApi.location.pathname)) return () => undefined;

  let checking = false;
  let refreshing = false;

  const checkForUpdate = async () => {
    if (checking || refreshing) return;
    checking = true;
    try {
      const currentVersion = readCurrentVersion();
      const servedVersion = await fetchVersion();
      if (!currentVersion || !servedVersion || currentVersion === servedVersion) return;

      refreshing = true;
      console.info('[version] Frontend atualizado detectado; recarregando runtime', {
        currentVersion,
        servedVersion,
      });
      await refresh();
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
