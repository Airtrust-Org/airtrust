const STAGING_API_HOST = 'airtrust-api-staging.airtrust.workers.dev';
const PRODUCTION_CANONICAL_HOST = 'api.airtrust.online';
const PRODUCTION_FALLBACK_HOST = 'airtrust-api-production.airtrust.workers.dev';
const PRODUCTION_BLOCKED_HOST = 'airtrust-api.airtrust.workers.dev';

const READ_ONLY_ENDPOINT_SPECS = [
  {
    name: 'auth/me',
    path: '/api/auth/me',
    expectedStatus: 200,
    validate(payload, context = {}) {
      const data = payload?.data;
      assert(data && typeof data === 'object', 'auth/me sem objeto data');
      assert(typeof data.id === 'number' || /^\d+$/.test(String(data.id || '')), 'auth/me sem id');
      assert(typeof data.email === 'string' && data.email.length > 3, 'auth/me sem email');
      assert(typeof data.role === 'string' && data.role.length > 0, 'auth/me sem role');
      assert(typeof data.nome === 'string' && data.nome.length > 0, 'auth/me sem nome');

      const expectedEmail = String(context.expectedEmail || '').toLowerCase();
      if (expectedEmail) {
        assert(
          data.email.toLowerCase() === expectedEmail,
          `auth/me email divergente: esperado ${maskEmail(expectedEmail)}, recebeu ${maskEmail(data.email)}`,
        );
      }

      return {
        count: 1,
        sample: {
          role: data.role,
          emailMatchesSecret: expectedEmail ? data.email.toLowerCase() === expectedEmail : null,
        },
      };
    },
  },
  {
    name: 'qualificacoes/formatos',
    path: '/api/qualificacoes/formatos',
    expectedStatus: 200,
    validate(payload) {
      const rows = assertArrayPayload(payload, 'qualificacoes/formatos');
      if (rows.length > 0) {
        assertHasKeys(rows[0], ['id', 'nome', 'codigo'], 'qualificacoes/formatos[0]');
      }
      return {
        count: extractCount(payload, rows),
        sample: rows.length > 0 ? pickKeys(rows[0], ['id', 'nome', 'codigo', 'empresa_id', 'total_tipos']) : null,
      };
    },
  },
  {
    name: 'qualificacoes/tipos',
    path: '/api/qualificacoes/tipos?limit=5',
    expectedStatus: 200,
    validate(payload) {
      const rows = assertArrayPayload(payload, 'qualificacoes/tipos');
      if (rows.length > 0) {
        assertHasKeys(rows[0], ['id', 'codigo', 'nome', 'categoria'], 'qualificacoes/tipos[0]');
      }
      return {
        count: extractCount(payload, rows),
        sample:
          rows.length > 0
            ? pickKeys(rows[0], [
                'id',
                'codigo',
                'nome',
                'categoria',
                'categoria_id',
                'formato_id',
                'formato_nome',
                'classe_requisito',
              ])
            : null,
      };
    },
  },
  {
    name: 'qualificacoes/historico',
    path: '/api/qualificacoes/historico?limit=5&stats=false',
    expectedStatus: 200,
    validate(payload) {
      const rows = assertArrayPayload(payload, 'qualificacoes/historico');
      if (rows.length > 0) {
        assertHasKeys(
          rows[0],
          ['id', 'funcionario_id', 'qualificacao_nome', 'qualificacao_categoria', 'status', 'modelo_aeronave'],
          'qualificacoes/historico[0]',
        );
      }
      return {
        count: extractCount(payload, rows),
        sample:
          rows.length > 0
            ? pickKeys(rows[0], [
                'id',
                'funcionario_id',
                'qualificacao_nome',
                'qualificacao_categoria',
                'status',
                'modelo_aeronave',
                'categoria_id',
              ])
            : null,
      };
    },
  },
  {
    name: 'lms/cursos',
    path: '/api/lms/cursos?limit=5',
    expectedStatus: 200,
    validate(payload) {
      const rows = assertArrayPayload(payload, 'lms/cursos');
      if (rows.length > 0) {
        assertHasKeys(rows[0], ['id', 'titulo', 'tipo_conteudo'], 'lms/cursos[0]');
      }
      return {
        count: extractCount(payload, rows),
        sample:
          rows.length > 0
            ? pickKeys(rows[0], [
                'id',
                'titulo',
                'tipo_conteudo',
                'categoria',
                'qualificacao_tipo_id',
                'formato_codigo',
                'formato_nome',
              ])
            : null,
      };
    },
  },
];

const NEGATIVE_SMOKE_PATHS = [
  '/api/auth/me',
  '/api/qualificacoes/formatos',
  '/api/qualificacoes/tipos',
  '/api/qualificacoes/historico',
  '/api/lms/cursos',
];

function normalizeBaseUrl(value, label = 'base URL') {
  const raw = String(value || '').trim();
  assert(raw.length > 0, `${label} vazio`);

  const parsed = new URL(raw.replace(/\/+$/, ''));
  assert(parsed.pathname === '/' || parsed.pathname === '', `${label} deve apontar para a raiz do host`);
  assert(!parsed.search && !parsed.hash, `${label} nao pode conter query ou hash`);

  return `${parsed.protocol}//${parsed.host}`;
}

function assertAllowedStagingBaseUrl(value) {
  const baseUrl = normalizeBaseUrl(value, 'STAGING_API_BASE_URL');
  const host = new URL(baseUrl).hostname.toLowerCase();

  assert(
    host === STAGING_API_HOST,
    `STAGING_API_BASE_URL deve apontar para ${STAGING_API_HOST}; recebeu ${host}`,
  );

  return baseUrl;
}

function assertAllowedProductionBaseUrl(value) {
  const baseUrl = normalizeBaseUrl(value, 'PROD_API_BASE_URL');
  const host = new URL(baseUrl).hostname.toLowerCase();

  assert(
    host !== PRODUCTION_BLOCKED_HOST,
    `PROD_API_BASE_URL nao pode apontar para ${PRODUCTION_BLOCKED_HOST} (alias nao canônico)`,
  );
  assert(
    host === PRODUCTION_CANONICAL_HOST || host === PRODUCTION_FALLBACK_HOST,
    `PROD_API_BASE_URL deve apontar para ${PRODUCTION_CANONICAL_HOST} ou ${PRODUCTION_FALLBACK_HOST}; recebeu ${host}`,
  );

  return baseUrl;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const rawText = await response.text();
  let json = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(`${url} retornou corpo nao JSON (${response.status})`);
  }

  return { status: response.status, json };
}

function extractCount(payload, rows) {
  return Number(
    payload?.meta?.count ??
      payload?.meta?.total ??
      payload?.pagination?.total ??
      payload?.pagination?.count ??
      rows.length,
  );
}

function assertArrayPayload(payload, label) {
  assert(payload?.success === true, `${label} sem success=true`);
  assert(Array.isArray(payload?.data), `${label} sem data[]`);
  return payload.data;
}

function assertHasKeys(row, keys, label) {
  for (const key of keys) {
    assert(Object.prototype.hasOwnProperty.call(row, key), `${label} sem campo ${key}`);
  }
}

function pickKeys(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function maskEmail(value) {
  const [local, domain] = String(value).split('@');
  if (!local || !domain) return 'invalid-email';
  return `${local.slice(0, 2)}***@${domain}`;
}

function extractAccessToken(payload) {
  const token =
    payload?.data?.accessToken ??
    payload?.data?.access_token ??
    payload?.accessToken ??
    payload?.access_token ??
    null;
  assert(typeof token === 'string' && token.length > 20, 'login sem accessToken');
  return token;
}

function decodeJwtPayload(token) {
  const parts = String(token).split('.');
  assert(parts.length >= 2, 'JWT malformado');
  const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const normalized = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const raw = Buffer.from(normalized, 'base64').toString('utf8');
  return JSON.parse(raw);
}

async function login(baseUrl, email, password) {
  let response;
  for (let i = 0; i < 5; i++) {
    response = await fetchJson(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: password }),
    });
    if (response.status !== 429) break;
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  }

  assert(response.status === 200, `login retornou ${response.status}`);
  assert(response.json?.success === true, 'login sem success=true');
  return response.json;
}

function extractRefreshToken(payload) {
  const token = payload?.data?.refreshToken ?? payload?.refreshToken ?? null;
  assert(typeof token === 'string' && token.length > 10, 'login/refresh sem refreshToken');
  return token;
}

async function refreshTokens(baseUrl, refreshToken) {
  return fetchJson(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

async function logout(baseUrl, { accessToken, refreshToken }) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetchJson(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ refreshToken }),
  });
}

async function selectEmpresa(baseUrl, accessToken, empresaId) {
  return fetchJson(`${baseUrl}/api/auth/select-empresa`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ empresaId }),
  });
}

function buildReadOnlyEndpointSpecs(expectedEmail) {
  return READ_ONLY_ENDPOINT_SPECS.map((spec) => ({
    ...spec,
    validate(payload) {
      return spec.validate(payload, { expectedEmail });
    },
  }));
}

export {
  PRODUCTION_BLOCKED_HOST,
  PRODUCTION_CANONICAL_HOST,
  PRODUCTION_FALLBACK_HOST,
  READ_ONLY_ENDPOINT_SPECS,
  NEGATIVE_SMOKE_PATHS,
  assertAllowedProductionBaseUrl,
  assertAllowedStagingBaseUrl,
  assertArrayPayload,
  assertHasKeys,
  buildReadOnlyEndpointSpecs,
  decodeJwtPayload,
  extractAccessToken,
  extractRefreshToken,
  extractCount,
  fetchJson,
  login,
  logout,
  maskEmail,
  normalizeBaseUrl,
  pickKeys,
  refreshTokens,
  selectEmpresa,
  assert,
};
