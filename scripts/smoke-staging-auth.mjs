#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const REQUIRED_SECRET_VARS = ['STAGING_SMOKE_EMAIL', 'STAGING_SMOKE_PASSWORD'];

const endpointSpecs = [
  {
    name: 'auth/me',
    path: '/api/auth/me',
    expectedStatus: 200,
    expectArray: false,
    validate(payload) {
      const data = payload?.data;
      assert(data && typeof data === 'object', 'auth/me sem objeto data');
      assert(typeof data.id === 'number' || /^\d+$/.test(String(data.id || '')), 'auth/me sem id');
      assert(typeof data.email === 'string' && data.email.length > 3, 'auth/me sem email');
      assert(typeof data.role === 'string' && data.role.length > 0, 'auth/me sem role');
      assert(typeof data.nome === 'string' && data.nome.length > 0, 'auth/me sem nome');
      return {
        count: 1,
        sample: {
          role: data.role,
          emailMatchesSecret: data.email.toLowerCase() === String(process.env.STAGING_SMOKE_EMAIL || '').toLowerCase(),
        },
      };
    },
  },
  {
    name: 'qualificacoes/formatos',
    path: '/api/qualificacoes/formatos',
    expectedStatus: 200,
    expectArray: true,
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
    expectArray: true,
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
    expectArray: true,
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
    expectArray: true,
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

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRunFlag = args.has('--dry-run');
  const strict = args.has('--strict') || process.env.CI === 'true';
  const baseUrl = String(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  log(`BASE_URL=${baseUrl}`);

  await checkHealth(baseUrl);
  await runNegativeSmoke(baseUrl);

  const missingVars = REQUIRED_SECRET_VARS.filter((name) => !String(process.env[name] || '').trim());
  if (missingVars.length > 0 || dryRunFlag) {
    log(`AUTH_SMOKE_MODE=${dryRunFlag ? 'dry-run-flag' : 'missing-secrets'}`);
    if (missingVars.length > 0) {
      log(`MISSING_SECRETS=${missingVars.join(',')}`);
    }
    if (strict && missingVars.length > 0) {
      throw new Error(`Segredos obrigatorios ausentes: ${missingVars.join(', ')}`);
    }
    log('AUTH_SMOKE_SKIPPED');
    return;
  }

  const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.STAGING_SMOKE_PASSWORD || '');

  const loginPayload = await login(baseUrl, email, password);
  const accessToken = extractAccessToken(loginPayload);
  const jwtClaims = decodeJwtPayload(accessToken);

  assert(jwtClaims && typeof jwtClaims === 'object', 'JWT invalido');
  assert(typeof jwtClaims.email === 'string', 'JWT sem email');
  assert(jwtClaims.email.toLowerCase() === email, 'JWT com email divergente');
  assert(Number.isInteger(Number(jwtClaims.empresa_id)) && Number(jwtClaims.empresa_id) > 0, 'JWT sem empresa_id valido');
  assert(typeof jwtClaims.role === 'string' && jwtClaims.role.length > 0, 'JWT sem role');

  log(`LOGIN_OK user=${maskEmail(email)} empresa_id=${jwtClaims.empresa_id} role=${jwtClaims.role}`);

  for (const spec of endpointSpecs) {
    const response = await fetchJson(`${baseUrl}${spec.path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert(response.status === spec.expectedStatus, `${spec.name} retornou ${response.status}`);
    const result = spec.validate(response.json);
    const count = result?.count ?? 0;
    log(
      [
        `AUTH_OK ${spec.name}`,
        `status=${response.status}`,
        `json=true`,
        `count=${count}`,
        result?.sample ? `sample=${JSON.stringify(result.sample)}` : 'sample=null',
      ].join(' '),
    );
  }

  const mePayload = await fetchJson(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meData = mePayload.json?.data ?? {};

  assert(String(meData.email || '').toLowerCase() === email, 'auth/me email divergente do login');
  assert(String(meData.role || '').length > 0, 'auth/me role vazio');
  assert(
    Number(jwtClaims.empresa_id) > 0 && !Array.isArray(meData.empresas) && !('tenant_ids' in meData),
    'indicio de payload cross-tenant em auth/me',
  );

  log('AUTH_SMOKE_DONE');
}

async function checkHealth(baseUrl) {
  const response = await fetchJson(`${baseUrl}/api/health`);
  assert(response.status === 200, `/api/health retornou ${response.status}`);
  log(`HEALTH_OK status=200 environment=${String(response.json?.stats?.environment || 'unknown')}`);
}

async function runNegativeSmoke(baseUrl) {
  const negativePaths = [
    '/api/auth/me',
    '/api/qualificacoes/formatos',
    '/api/qualificacoes/tipos',
    '/api/qualificacoes/historico',
    '/api/lms/cursos',
  ];

  for (const path of negativePaths) {
    const response = await fetchJson(`${baseUrl}${path}`);
    assert(response.status === 401, `${path} sem token deveria retornar 401, retornou ${response.status}`);
    log(`NEGATIVE_OK path=${path} status=401`);
  }
}

async function login(baseUrl, email, password) {
  const response = await fetchJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: password }),
  });

  assert(response.status === 200, `login retornou ${response.status}`);
  assert(response.json?.success === true, 'login sem success=true');
  return response.json;
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
  } catch (error) {
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
  return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
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

function log(message) {
  process.stdout.write(`[staging-auth-smoke] ${message}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[staging-auth-smoke][ERROR] ${message}\n`);
  process.exitCode = 1;
});
