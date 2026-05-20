import { API_BASE_URL, getAccessToken } from '../react-app/config/api';

type Primitive = string | number | boolean;

type ApiParams = Record<string, Primitive | Primitive[] | null | undefined>;

interface ApiConfig {
  headers?: Record<string, string>;
  responseType?: 'json' | 'blob' | 'text';
  params?: ApiParams;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: ApiParams): string {
  const base = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  if (!params || Object.keys(params).length === 0) {
    return base;
  }

  const url = new URL(base, typeof window !== 'undefined' ? window.location.origin : undefined);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, String(v)));
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

async function parseResponse(response: Response, responseType: ApiConfig['responseType']) {
  if (responseType === 'blob') {
    return response.blob();
  }

  if (responseType === 'text') {
    return response.text();
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(method: string, path: string, data?: unknown, config: ApiConfig = {}) {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(config.headers || {}),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (data !== undefined && data !== null) {
    if (data instanceof FormData) {
      body = data;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(data);
    }
  }

  const response = await fetch(buildUrl(path, config.params), {
    method,
    headers,
    body,
    signal: config.signal,
  });

  const parsed = await parseResponse(response, config.responseType);

  if (!response.ok) {
    const fallbackMessage = `Erro HTTP ${response.status}`;
    const message =
      (parsed && typeof parsed === 'object' && ('error' in parsed || 'message' in parsed)
        ? (parsed as { error?: string; message?: string }).error ||
          (parsed as { error?: string; message?: string }).message
        : null) || fallbackMessage;

    const error = new Error(message);
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { status?: number; data?: unknown }).data = parsed;
    throw error;
  }

  return parsed;
}

const api = {
  get: (path: string, config?: ApiConfig) => request('GET', path, undefined, config),
  post: (path: string, data?: unknown, config?: ApiConfig) => request('POST', path, data, config),
  put: (path: string, data?: unknown, config?: ApiConfig) => request('PUT', path, data, config),
  patch: (path: string, data?: unknown, config?: ApiConfig) => request('PATCH', path, data, config),
  delete: (path: string, config?: ApiConfig) => request('DELETE', path, undefined, config),
};

console.info('[API] Legacy compatibility adapter ativo:', API_BASE_URL);

export default api;
