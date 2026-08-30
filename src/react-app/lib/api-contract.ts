import { appFetch } from '@/react-app/lib/app-fetch';
import {
  assertTenantDataScope,
  captureTenantDataScope,
  StaleTenantResponseError,
} from '@/react-app/lib/tenant-data-layer';

export type ApiFailureKind =
  'permission' | 'session-expired' | 'network' | 'server' | 'client' | 'stale-tenant';

export class FrontendApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiFailureKind,
    public readonly status?: number,
    public readonly code?: string | number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FrontendApiError';
  }
}

export interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string | number;
  details?: unknown;
  [key: string]: unknown;
}

const TECHNICAL_API_ERROR_PATTERNS = [
  /\b(?:SQLITE(?:_ERROR)?|D1_ERROR|SQLSTATE|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/i,
  /\bno such (?:table|column)\b/i,
  /\b(?:stack trace|traceback|internal server error)\b/i,
  /\b(?:SyntaxError|TypeError|ReferenceError|RangeError):/i,
  /\bHTTP\s+[45]\d{2}\b/i,
  /\bat\s+(?:async\s+)?[\w.$<>]+\s*\([^)]*\.(?:ts|tsx|js|mjs|cjs):\d+:\d+\)/i,
  /\b(?:worker|node_modules|dist|src)[\\/][^\s)]+\.(?:ts|tsx|js|mjs|cjs):\d+/i,
];

export function safeFrontendApiErrorMessage(
  message: string | undefined,
  fallback = 'Não foi possível concluir a operação.',
): string {
  const normalized = String(message || '').trim();
  if (!normalized) return fallback;
  return TECHNICAL_API_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
    ? fallback
    : normalized;
}

function classifyStatus(status: number): ApiFailureKind {
  if (status === 401) return 'session-expired';
  if (status === 403) return 'permission';
  if (status >= 500) return 'server';
  return 'client';
}

function fallbackForStatus(status?: number): string {
  if (status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (status === 403) return 'Você não tem permissão para executar esta ação.';
  if (status != null && status >= 500) return 'O servidor não conseguiu concluir a operação.';
  return 'Não foi possível concluir a operação.';
}

function safeApiBoundaryMessage(message: string | undefined, status?: number): string {
  return safeFrontendApiErrorMessage(message, fallbackForStatus(status));
}

function isNetworkTypeError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'TypeError')
  );
}

export function classifyFrontendError(error: unknown): FrontendApiError {
  if (error instanceof FrontendApiError) return error;
  if (error instanceof StaleTenantResponseError) {
    return new FrontendApiError(error.message, 'stale-tenant');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new FrontendApiError(
      'A requisição foi cancelada após mudança de sessão.',
      'stale-tenant',
    );
  }
  if (isNetworkTypeError(error)) {
    return new FrontendApiError('Não foi possível conectar ao servidor.', 'network');
  }
  return new FrontendApiError(
    safeFrontendApiErrorMessage(
      error instanceof Error ? error.message : 'Erro inesperado na requisição.',
    ),
    'client',
  );
}

export function frontendErrorMessage(error: unknown): string {
  const classified = classifyFrontendError(error);
  switch (classified.kind) {
    case 'permission':
      return 'Você não tem permissão para executar esta ação.';
    case 'session-expired':
      return 'Sua sessão expirou. Entre novamente.';
    case 'network':
      return 'Falha de rede. Verifique sua conexão e tente novamente.';
    case 'server':
      return 'O servidor não conseguiu concluir a operação.';
    case 'stale-tenant':
      return 'A empresa ativa mudou. Os dados anteriores foram descartados.';
    default:
      return safeFrontendApiErrorMessage(classified.message);
  }
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => undefined);
  }
  return response.text().catch(() => undefined);
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.success === false) {
      throw new FrontendApiError(
        safeApiBoundaryMessage(envelope.error || envelope.message),
        'client',
        undefined,
        envelope.code,
        envelope.details,
      );
    }
    if (envelope.success === true && Object.prototype.hasOwnProperty.call(envelope, 'data')) {
      return envelope.data as T;
    }
  }
  return payload as T;
}

export async function apiEnvelope<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiEnvelope<T>> {
  const scope = captureTenantDataScope();
  let response: Response;
  try {
    response = await appFetch(input, init);
  } catch (error) {
    throw classifyFrontendError(error);
  }

  const payload = await readPayload(response);
  assertTenantDataScope(scope);
  const envelope =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as ApiEnvelope<T>)
      : ({ success: response.ok, data: payload as T } satisfies ApiEnvelope<T>);

  if (!response.ok || envelope.success === false) {
    throw new FrontendApiError(
      safeApiBoundaryMessage(
        envelope.error || envelope.message || `Erro HTTP ${response.status}`,
        response.status,
      ),
      classifyStatus(response.status),
      response.status,
      envelope.code,
      envelope.details ?? payload,
    );
  }

  return envelope;
}

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const scope = captureTenantDataScope();
  let response: Response;
  try {
    response = await appFetch(input, init);
  } catch (error) {
    throw classifyFrontendError(error);
  }

  const payload = await readPayload(response);
  assertTenantDataScope(scope);

  if (!response.ok) {
    const envelope =
      payload && typeof payload === 'object' ? (payload as ApiEnvelope<unknown>) : undefined;
    throw new FrontendApiError(
      safeApiBoundaryMessage(
        envelope?.error || envelope?.message || `Erro HTTP ${response.status}`,
        response.status,
      ),
      classifyStatus(response.status),
      response.status,
      envelope?.code,
      envelope?.details ?? payload,
    );
  }

  return unwrapEnvelope<T>(payload);
}

export async function apiBlob(input: RequestInfo | URL, init?: RequestInit): Promise<Blob> {
  const scope = captureTenantDataScope();
  let response: Response;
  try {
    response = await appFetch(input, init);
  } catch (error) {
    throw classifyFrontendError(error);
  }

  if (!response.ok) {
    const payload = await readPayload(response);
    const envelope =
      payload && typeof payload === 'object' ? (payload as ApiEnvelope<unknown>) : undefined;
    throw new FrontendApiError(
      safeApiBoundaryMessage(
        envelope?.error || envelope?.message || `Erro HTTP ${response.status}`,
        response.status,
      ),
      classifyStatus(response.status),
      response.status,
      envelope?.code,
      envelope?.details ?? payload,
    );
  }

  const bytes = await response.arrayBuffer();
  const blob = new Blob([bytes], {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
  assertTenantDataScope(scope);
  return blob;
}
