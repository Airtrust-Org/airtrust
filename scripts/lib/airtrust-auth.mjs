/**
 * Helper de autenticação AirTrust para scripts operacionais.
 *
 * Resolve credenciais nesta ordem:
 *   1. Variáveis de ambiente (AIRTRUST_EMAIL/AIRTRUST_PASSWORD ou AIRTRUST_AUTH_TOKEN)
 *   2. Arquivo local ~/.airtrust/credentials.json (criado por `npm run auth:setup`)
 *
 * O arquivo é gravado com permissão 0600 e fica fora do repositório.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.airtrust');
const CRED_FILE = join(DIR, 'credentials.json');

export function normalizeBase(url) {
  return String(url || 'https://api.airtrust.online').replace(/\/+$/, '');
}

export function loadCredentials() {
  const email = process.env.AIRTRUST_EMAIL || '';
  const password = process.env.AIRTRUST_PASSWORD || '';
  const token = process.env.AIRTRUST_AUTH_TOKEN || '';
  if (token || (email && password)) {
    return { email, password, token };
  }
  try {
    const cfg = JSON.parse(readFileSync(CRED_FILE, 'utf8'));
    if (cfg && cfg.email && cfg.senha) {
      return { email: cfg.email, password: cfg.senha, token: '' };
    }
  } catch {
    /* arquivo inexistente ou inválido */
  }
  return { email: '', password: '', token: '' };
}

export function saveCredentials({ email, senha }) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(CRED_FILE, JSON.stringify({ email, senha }, null, 2), { mode: 0o600 });
  try {
    chmodSync(CRED_FILE, 0o600);
  } catch {
    /* plataformas sem chmod */
  }
  return CRED_FILE;
}

export function credentialsPath() {
  return CRED_FILE;
}

/**
 * Requisição autenticada com retry em 429.
 */
export async function request(apiBase, path, token, opts = {}) {
  const method = opts.method || 'GET';
  const headers = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let lastStatus = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    lastStatus = res.status;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      const delayMs =
        retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      console.warn(`[AUTH] HTTP 429 em ${path} (tentativa ${attempt}/5), aguardando ${Math.round(delayMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Resposta não-JSON de ${path} (HTTP ${res.status})`);
    }
    if (!res.ok || json?.success === false) {
      throw new Error(`Falha HTTP ${res.status} em ${path}: ${json?.error || JSON.stringify(json) || ''}`);
    }
    return json;
  }
  throw new Error(`Rate limited persistente em ${path} (último HTTP ${lastStatus})`);
}

async function doLogin(apiBase, email, senha) {
  const res = await request(apiBase, '/api/auth/login', '', {
    method: 'POST',
    body: { email, senha },
  });
  const token =
    res?.data?.accessToken ?? res?.data?.access_token ?? res?.accessToken ?? res?.access_token ?? '';
  if (typeof token !== 'string' || token.length < 20) {
    throw new Error('Login sem accessToken válido (credenciais inválidas?).');
  }
  return token;
}

/**
 * Autentica usando credenciais resolvidas (env ou arquivo local).
 * Aceita um override para o fluxo de setup interativo.
 */
export async function authenticate(apiBase, override = {}) {
  const creds = override.email ? override : loadCredentials();

  if (creds.token) return creds.token;

  if (!creds.email || !creds.password) {
    throw new Error(
      'Credenciais não configuradas. Rode uma vez: npm run auth:setup (ou defina AIRTRUST_EMAIL/AIRTRUST_PASSWORD).',
    );
  }

  return doLogin(apiBase, creds.email, creds.password);
}
