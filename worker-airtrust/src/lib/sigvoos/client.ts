export const SIGVOOS_DEFAULT_BASE_URL = 'https://api.sigvoos.com.br/api';
export const SIGVOOS_DEFAULT_SYSTEM = 'sigtrip';
export const SIGVOOS_PASSWORD_MARKER = '__WORKER_ENCRYPTED__';
export const SIGVOOS_PASSWORD_ENCRYPTED_PREFIX = 'enc:v1';

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

export async function decryptSigvoosPassword(cipherText: string, secret: string): Promise<string | null> {
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
    this.fetchImpl = options?.fetchImpl || fetch;
  }

  public async fetchJson(url: string, init: RequestInit, timeoutMs = 8000): Promise<Record<string, unknown>> {
    let lastError: Error | null = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      const text = await response.text();
      let parsed: Record<string, unknown> = {};

      if (text.trim().length > 0) {
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          parsed = { raw: text };
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          this.token = null;
          throw new SigvoosClientError('SIGVOOS_UNAUTHORIZED', 'Unauthorized', 401);
        }
        if (response.status >= 500) {
          throw new SigvoosClientError('SIGVOOS_SERVER_ERROR', `Server Error: ${response.status}`, response.status);
        }
        
        const sanitized = { ...parsed };
        for (const k of Object.keys(sanitized)) {
          if (/(token|senha|password|secret|credential|authorization|tkn|pwd)/i.test(k)) {
            sanitized[k] = '[MASKED]';
          }
        }

        throw new SigvoosClientError('SIGVOOS_HTTP_ERROR', `HTTP ${response.status}: ${JSON.stringify(sanitized).slice(0, 300)}`, response.status);
      }

      return parsed;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
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

    const res = await this.fetchJson(`${this.config.base_url.replace(/\/$/, '')}/get/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const token = res.accessToken || res.access_token || res.token;
    if (typeof token !== 'string') {
      throw new SigvoosClientError('SIGVOOS_AUTH_FAILED', 'Token não retornado ou inválido.', 401);
    }
    
    this.token = token;
    return token;
  }

  public async postSearch(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    let token = await this.authenticate();
    try {
      return await this.fetchJson(`${this.config.base_url.replace(/\/$/, '')}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err instanceof SigvoosClientError && err.code === 'SIGVOOS_UNAUTHORIZED') {
        token = await this.authenticate(true);
        return await this.fetchJson(`${this.config.base_url.replace(/\/$/, '')}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }
      throw err;
    }
  }

  public formatSigvoosDate(isoDate: string): string {
    if (!/\\d{4}-\\d{2}-\\d{2}/.test(isoDate)) return isoDate;
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }
}
