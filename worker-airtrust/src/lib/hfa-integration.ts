import type { Env } from '../types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(secret),
  );
  return crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptHfaToken(
  token: string,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(secret);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(token),
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptHfaToken(
  value: string,
  secret: string,
): Promise<string> {
  const [version, ivPart, cipherPart] = value.split('.');
  if (version !== 'v1' || !ivPart || !cipherPart) {
    throw new Error('HFA_TOKEN_FORMAT_INVALID');
  }
  const key = await importKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
    key,
    fromBase64Url(cipherPart),
  );
  return decoder.decode(plain);
}
export function normalizeHfaBaseUrl(
  raw: string,
  env: Pick<Env, 'ENVIRONMENT'>,
): string {
  const url = new URL(raw.trim());
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    url.protocol !== 'https:' &&
    !(env.ENVIRONMENT === 'development' && local)
  ) {
    throw new Error('HFA_BASE_URL_HTTPS_REQUIRED');
  }
  return url.toString().replace(/\/$/, '');
}

export function hfaEncryptionSecret(
  env: Pick<Env, 'HFA_INTEGRATION_ENCRYPTION_KEY'>,
): string {
  const secret = env.HFA_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 24) {
    throw new Error('HFA_INTEGRATION_ENCRYPTION_KEY_MISSING');
  }
  return secret;
}


const HFA_MAX_RESPONSE_BYTES = 1024 * 1024;

export async function readHfaJson(response: Response): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > HFA_MAX_RESPONSE_BYTES) {
    throw new Error('HFA_RESPONSE_TOO_LARGE');
  }
  const body = await response.text();
  if (encoder.encode(body).byteLength > HFA_MAX_RESPONSE_BYTES) {
    throw new Error('HFA_RESPONSE_TOO_LARGE');
  }
  if (!body) return {};
  const parsed = JSON.parse(body);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
