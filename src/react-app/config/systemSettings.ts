import { API_BASE_URL, getAccessToken } from './api';

export interface SystemSettings {
  appName: string;
  logoDataUrl: string | null;
  faviconDataUrl: string | null;
  compactHeader: boolean;
  defaultPageSize: 20 | 50 | 100;
  enableAnimations: boolean;
  timezone: string;
}

export const SYSTEM_SETTINGS_STORAGE_KEY = 'airtrust_system_settings_v1';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  appName: 'AirTrust',
  logoDataUrl: null,
  faviconDataUrl: null,
  compactHeader: false,
  defaultPageSize: 20,
  enableAnimations: true,
  timezone: 'UTC',
};

export interface ServerSystemSettings {
  empresaId: number;
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  compactHeader: boolean;
  defaultPageSize: 20 | 50 | 100;
  enableAnimations: boolean;
  timezone: string;
}

function resolveBrandingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/api/')) {
    const apiOrigin = API_BASE_URL.replace(/\/api$/, '');
    return `${apiOrigin}${url}`;
  }
  return url;
}

function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function normalizeSystemSettings(
  input: Partial<SystemSettings> | null | undefined,
): SystemSettings {
  const pageSize = input?.defaultPageSize;
  const normalizedPageSize = pageSize === 50 || pageSize === 100 ? pageSize : 20;
  const tz =
    typeof input?.timezone === 'string' && input.timezone.trim().length > 0
      ? input.timezone.trim()
      : DEFAULT_SYSTEM_SETTINGS.timezone;

  return {
    appName: input?.appName?.trim() || DEFAULT_SYSTEM_SETTINGS.appName,
    logoDataUrl: resolveBrandingUrl(input?.logoDataUrl),
    faviconDataUrl: resolveBrandingUrl(input?.faviconDataUrl),
    compactHeader: Boolean(input?.compactHeader),
    defaultPageSize: normalizedPageSize,
    enableAnimations: input?.enableAnimations ?? DEFAULT_SYSTEM_SETTINGS.enableAnimations,
    timezone: tz,
  };
}

export function mapServerToLocalSettings(server: ServerSystemSettings): SystemSettings {
  return normalizeSystemSettings({
    appName: server.appName,
    logoDataUrl: server.logoUrl,
    faviconDataUrl: server.faviconUrl,
    compactHeader: server.compactHeader,
    defaultPageSize: server.defaultPageSize,
    enableAnimations: server.enableAnimations,
    timezone: server.timezone,
  });
}

export function getSystemSettings(): SystemSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SYSTEM_SETTINGS;
  }

  const raw = localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_SYSTEM_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SystemSettings>;
    return normalizeSystemSettings(parsed);
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export function saveSystemSettings(settings: SystemSettings): void {
  if (typeof window === 'undefined') return;

  const normalized = normalizeSystemSettings(settings);
  localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('airtrust:system-settings-updated'));
}

export async function fetchSystemSettingsFromServer(): Promise<ServerSystemSettings> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Sem autenticação para carregar configurações do sistema');
  }

  const response = await fetch(`${API_BASE_URL}/empresas/minha/sistema`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Falha ao carregar configurações do sistema no servidor');
  }

  const json = await response.json();
  return json.data as ServerSystemSettings;
}

export async function saveSystemSettingsToServer(
  payload: SystemSettings,
  empresaId: number,
): Promise<ServerSystemSettings> {
  const response = await fetch(`${API_BASE_URL}/empresas/minha/sistema`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      appName: payload.appName,
      logoUrl: payload.logoDataUrl,
      faviconUrl: payload.faviconDataUrl,
      compactHeader: payload.compactHeader,
      defaultPageSize: payload.defaultPageSize,
      enableAnimations: payload.enableAnimations,
      timezone: payload.timezone,
    }),
  });

  if (!response.ok) {
    throw new Error('Falha ao salvar configurações no servidor');
  }

  return {
    empresaId,
    appName: payload.appName,
    logoUrl: payload.logoDataUrl,
    faviconUrl: payload.faviconDataUrl,
    compactHeader: payload.compactHeader,
    defaultPageSize: payload.defaultPageSize,
    enableAnimations: payload.enableAnimations,
    timezone: payload.timezone,
  };
}

export async function uploadSystemBrandingAsset(
  empresaId: number,
  file: File,
  target: 'sistema-logo' | 'sistema-favicon',
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/empresas/${empresaId}/logo?target=${target}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => null);
    const errorMessage =
      errorJson?.error || errorJson?.message || 'Falha no upload da imagem de branding';
    throw new Error(errorMessage);
  }

  const json = await response.json();
  return String(json?.data?.logo_url || '');
}

export function applySystemSettingsToDocument(settings: SystemSettings): void {
  if (typeof document === 'undefined') return;

  document.title = settings.appName || DEFAULT_SYSTEM_SETTINGS.appName;

  const faviconHref = resolveBrandingUrl(settings.faviconDataUrl) || '/favicon.svg';
  const faviconType =
    faviconHref.startsWith('data:image/png') || faviconHref.endsWith('.png')
      ? 'image/png'
      : 'image/svg+xml';

  const iconLink =
    document.querySelector<HTMLLinkElement>("link[rel='icon']") ?? document.createElement('link');
  iconLink.setAttribute('rel', 'icon');
  iconLink.setAttribute('type', faviconType);
  iconLink.setAttribute('href', faviconHref);
  if (!iconLink.parentElement) document.head.appendChild(iconLink);

  const appleLink =
    document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']") ??
    document.createElement('link');
  appleLink.setAttribute('rel', 'apple-touch-icon');
  appleLink.setAttribute('href', faviconHref);
  if (!appleLink.parentElement) document.head.appendChild(appleLink);

  document.documentElement.classList.toggle('airtrust-compact-header', settings.compactHeader);
  document.documentElement.classList.toggle('airtrust-no-animations', !settings.enableAnimations);
}

export function getSystemLogoSrc(settings: SystemSettings): string {
  return resolveBrandingUrl(settings.logoDataUrl) || '/airtrust-logo.svg';
}
