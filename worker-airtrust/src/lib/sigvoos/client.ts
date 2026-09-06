import {
  classifySigvoosHttpStatus,
  detectSigvoosApplicationError,
  SIGVOOS_OPERATIONAL_SEARCH_ENDPOINT,
} from './contract-guards';

export const SIGVOOS_DEFAULT_BASE_URL = 'https://api.sigvoos.com.br/api';
export const SIGVOOS_DEFAULT_SYSTEM = 'sigtrip';
export const SIGVOOS_PASSWORD_MARKER = '__WORKER_ENCRYPTED__';
export const SIGVOOS_PASSWORD_ENCRYPTED_PREFIX = 'enc:v1';

const SIGVOOS_MAX_CLIENT_BATCH = 1000;
export const SIGVOOS_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class SigvoosClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'SigvoosClientError';
  }
}

export interface SigvoosConfig {
  base_url: string;
  username: string | null;
  password: string | null;
  system: string;
  [key: string]: unknown;
}

export interface SigvoosRuntimeEnv {
  SIGVOOS_CONFIG_ENCRYPTION_KEY?: string;
  JWT_SECRET?: string;
}

export function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < value.length; i++) binary += String.fromCharCode(value[i]);
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const decoded = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) decoded[index] = binary.charCodeAt(index);
  return decoded;
}

export function resolveSigvoosEncryptionSecret(env?: SigvoosRuntimeEnv | null): string | null {
  if (!env) return null;
  const fromDedicated = env.SIGVOOS_CONFIG_ENCRYPTION_KEY;
  if (typeof fromDedicated === 'string' && fromDedicated.trim().length > 0) {
    return fromDedicated.trim();
  }

  const fromJwt = env.JWT_SECRET;
  if (typeof fromJwt === 'string' && fromJwt.trim().length > 0) {
    return fromJwt.trim();
  }

  return null;
}

export async function importSigvoosAesKey(secret: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSigvoosPassword(plain: string, secret: string): Promise<string> {
  const key = await importSigvoosAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(plain);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  return `${SIGVOOS_PASSWORD_ENCRYPTED_PREFIX}:${encodeBase64(iv)}:${encodeBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSigvoosPassword(
  cipherText: string,
  secret: string,
): Promise<string | null> {
  if (!cipherText.startsWith(`${SIGVOOS_PASSWORD_ENCRYPTED_PREFIX}:`)) {
    return null;
  }
  const parts = cipherText.split(':');
  if (parts.length !== 4) return null;

  const iv = decodeBase64(parts[2]);
  const payload = decodeBase64(parts[3]);
  const key = await importSigvoosAesKey(secret);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
  return new TextDecoder().decode(decrypted);
}

export async function readSigvoosResponseTextBounded(
  response: Response,
  maxBytes = SIGVOOS_MAX_RESPONSE_BYTES,
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SigvoosClientError(
      'SIGVOOS_RESPONSE_TOO_LARGE',
      `Resposta SIGVOOS excede o limite de ${maxBytes} bytes`,
      response.status,
    );
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('SIGVOOS_RESPONSE_TOO_LARGE').catch(() => undefined);
        throw new SigvoosClientError(
          'SIGVOOS_RESPONSE_TOO_LARGE',
          `Resposta SIGVOOS excede o limite de ${maxBytes} bytes`,
          response.status,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function resolveRequestedSearchLimit(payload: Record<string, unknown>): number | null {
  const raw = payload.limit ?? payload.page_size;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(SIGVOOS_MAX_CLIENT_BATCH, Math.max(1, Math.trunc(parsed)));
}

function capNestedSearchArrays(value: unknown, maxItems: number, depth = 0): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, maxItems);
  }
  if (!value || typeof value !== 'object' || depth >= 3) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      capNestedSearchArrays(nested, maxItems, depth + 1),
    ]),
  );
}

/**
 * A API SIGVOOS pode ignorar limit/page_size e devolver um período inteiro.
 * Mantemos no máximo `limit + 1`: o item adicional funciona como sentinela para
 * o paginador detectar resposta superdimensionada e interromper novas páginas.
 */
export function capSigvoosSearchPayload(
  payload: Record<string, unknown>,
  requestedLimit: number,
): Record<string, unknown> {
  const limit = Math.min(SIGVOOS_MAX_CLIENT_BATCH, Math.max(1, Math.trunc(requestedLimit)));
  return capNestedSearchArrays(payload, limit + 1) as Record<string, unknown>;
}

function applyOperationalSearchCap(
  endpoint: string,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
): Record<string, unknown> {
  if (endpoint !== SIGVOOS_OPERATIONAL_SEARCH_ENDPOINT) {
    return responsePayload;
  }
  const requestedLimit = resolveRequestedSearchLimit(requestPayload);
  return requestedLimit
    ? capSigvoosSearchPayload(responsePayload, requestedLimit)
    : responsePayload;
}

/**
 * SigvoosApiClient - Unified client for SIGVOOS integration.
 *
 * DIRETRIZES DE USO (CONTRATO DE ARQUITETURA):
 * 1. Timeout com AbortController é permitido.
 * 2. Retry e backoff artificial continuam ESTRITAMENTE PROIBIDOS para evitar congestionamento na API de destino.
 * 3. Reautenticação (retry após erro 401) só deve ser executada se o endpoint de negócio original for comprovadamente idempotente/read-only (ex: GETs e buscas limitadas).
 */
export class SigvoosApiClient {
  private token: string | null = null;
  private fetchImpl: typeof fetch;

  constructor(
    private config: SigvoosConfig,
    options?: { fetchImpl?: typeof fetch },
  ) {
    // Do NOT assign the bare global `fetch` reference here (`options?.fetchImpl || fetch`).
    // The real Cloudflare Workers runtime requires `fetch` be invoked with `this ===
    // globalThis`; calling it later as `this.fetchImpl(...)` invokes it with `this` bound
    // to the SigvoosApiClient instance instead, which Workers rejects with "Illegal
    // invocation: function called with incorrect `this` reference." (An arrow-function
    // wrapper calling bare `fetch(...)` does NOT fix this either — under ES module strict
    // mode, an unbound call yields `this === undefined`, not globalThis, and Workers still
    // rejects it.) `.bind(globalThis)` is required. This never reproduces under vitest's
    // Node-based fetch, only in a real deployment — see
    // src/__tests__/lib/sigvoos-client-fetch-binding.test.ts for a regression test that
    // simulates the real runtime's receiver check.
    this.fetchImpl = options?.fetchImpl || fetch.bind(globalThis);
  }

  public async fetchJson(
    url: string,
    init: RequestInit,
    timeoutMs = 8000,
  ): Promise<Record<string, unknown>> {
    let lastError: Error | null = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      let text: string;
      try {
        response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        text = await readSigvoosResponseTextBounded(response);
      } finally {
        clearTimeout(timeoutId);
      }

      let parsed: Record<string, unknown> = {};

      if (text.trim().length > 0) {
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          parsed = { raw: text };
        }
      }

      if (!response.ok) {
        const code = classifySigvoosHttpStatus(response.status);
        if (code === 'SIGVOOS_UNAUTHORIZED') {
          this.token = null;
          throw new SigvoosClientError('SIGVOOS_UNAUTHORIZED', 'Unauthorized', 401);
        }
        if (code === 'SIGVOOS_UPSTREAM_UNAVAILABLE' || code === 'SIGVOOS_SERVER_ERROR') {
          throw new SigvoosClientError(
            code,
            `Server Error: ${response.status}`,
            response.status,
          );
        }

        const sanitized = { ...parsed };
        for (const key of Object.keys(sanitized)) {
          if (/(token|senha|password|secret|credential|authorization|tkn|pwd)/i.test(key)) {
            sanitized[key] = '[MASKED]';
          }
        }

        throw new SigvoosClientError(
          'SIGVOOS_HTTP_ERROR',
          `HTTP ${response.status}: ${JSON.stringify(sanitized).slice(0, 300)}`,
          response.status,
        );
      }

      return parsed;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === 'AbortError') {
        throw new SigvoosClientError('SIGVOOS_TIMEOUT', 'Timeout ao acessar SIGVOOS');
      }
      throw lastError;
    }
  }

  public async authenticate(force = false): Promise<string> {
    if (this.token && !force) return this.token;
    if (!this.config.username || !this.config.password) {
      throw new SigvoosClientError('SIGVOOS_CREDENTIALS_MISSING', 'Credenciais não configuradas.');
    }

    const payload = {
      username: this.config.username,
      password: this.config.password,
      system: this.config.system || SIGVOOS_DEFAULT_SYSTEM,
    };

    const response = await this.fetchJson(`${this.config.base_url.replace(/\/$/, '')}/get/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    // SIGVOOS wraps its payload under a `data` envelope for at least some
    // deployments (observed real shape: {status, message, data: {...}}).
    // Accept the token at the top level OR nested one level under `data`,
    // without assuming which shape a given SIGVOOS environment uses.
    const nested =
      response.data && typeof response.data === 'object'
        ? (response.data as Record<string, unknown>)
        : null;
    const rawToken =
      response.accessToken ||
      response.access_token ||
      response.token ||
      nested?.accessToken ||
      nested?.access_token ||
      nested?.token;
    // The documented auth shape serializes the token object inside data.token.
    // Keep direct bearer shapes for compatibility, but unwrap this real shape
    // before it reaches the Authorization header.
    let token = rawToken;
    if (typeof rawToken === 'string') {
      try {
        const parsed = JSON.parse(rawToken) as Record<string, unknown>;
        token = parsed.access_token || parsed.accessToken || parsed.token || rawToken;
      } catch {
        // A normal bearer is not JSON and remains valid as-is.
      }
    }
    if (typeof token !== 'string') {
      // Never include response values (they could echo credentials/PII) —
      // only key names (top-level, and one level under `data` if present),
      // so this is safely diagnosable from sanitized error_summary fields
      // without exposing any secret content.
      const presentKeys = response && typeof response === 'object' ? Object.keys(response) : [];
      const nestedKeys = nested ? Object.keys(nested) : null;
      throw new SigvoosClientError(
        'SIGVOOS_AUTH_FAILED',
        `Token não retornado ou inválido. [responseKeys=${presentKeys.join(',') || 'none'}]` +
          (nestedKeys ? ` [dataKeys=${nestedKeys.join(',') || 'none'}]` : ''),
        401,
      );
    }

    this.token = token;
    return token;
  }

  public async postSearch(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let token = await this.authenticate();
    try {
      const response = await this.fetchJson(
        `${this.config.base_url.replace(/\/$/, '')}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (endpoint === SIGVOOS_OPERATIONAL_SEARCH_ENDPOINT) {
        const applicationError = detectSigvoosApplicationError(response);
        if (applicationError) throw new SigvoosClientError(applicationError.code, applicationError.message);
      }
      return applyOperationalSearchCap(endpoint, payload, response);
    } catch (error) {
      if (error instanceof SigvoosClientError && error.code === 'SIGVOOS_UNAUTHORIZED') {
        token = await this.authenticate(true);
        const response = await this.fetchJson(
          `${this.config.base_url.replace(/\/$/, '')}${endpoint}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          },
        );
        if (endpoint === SIGVOOS_OPERATIONAL_SEARCH_ENDPOINT) {
          const applicationError = detectSigvoosApplicationError(response);
          if (applicationError) throw new SigvoosClientError(applicationError.code, applicationError.message);
        }
        return applyOperationalSearchCap(endpoint, payload, response);
      }
      throw error;
    }
  }

  public formatSigvoosDate(isoDate: string): string {
    if (!/\d{4}-\d{2}-\d{2}/.test(isoDate)) return isoDate;
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }
}
