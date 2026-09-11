#!/usr/bin/env node

// Staging-only authenticated smoke for Controle de Voos operational catalogs.
// Uses the disposable two-tenant manifest produced by
// provision-controle-voos-e2e-fixtures.mjs and never prints passwords/tokens.
// All created rows belong to the synthetic tenants and are removed by
// cleanup-controle-voos-e2e-fixtures.mjs.

import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const BASE_URL = process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL;
const EXPECTED_HOST = 'airtrust-api-staging.airtrust.workers.dev';

function assertStagingTarget(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== EXPECTED_HOST) {
    throw new Error(`STAGING_TARGET_REJECTED:${url.hostname}`);
  }
  return url.origin;
}

const SAFE_BASE_URL = assertStagingTarget(BASE_URL);
const operations = [];

function log(message) {
  process.stderr.write(`[smoke-cv-catalogs] ${message}\n`);
}

function addResult(operation, result, details = {}) {
  operations.push({ operation, result, ...details });
}

async function login(key, user) {
  const started = Date.now();
  const response = await fetch(`${SAFE_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, senha: user.password }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const token = payload?.data?.accessToken || null;
  const passed = response.status === 200 && Boolean(token);
  addResult(`login:${key}`, passed ? 'PASS' : 'FAIL', {
    method: 'POST',
    route: '/api/auth/login',
    expected_status: 200,
    observed_status: response.status,
    duration_ms: Date.now() - started,
  });
  log(`${passed ? 'OK  ' : 'FAIL'} login:${key} -> ${response.status}`);
  if (!passed) throw new Error(`LOGIN_FAILED:${key}`);
  return { ...user, token };
}

async function call({ operation, actor, method, path, expectedStatus, body }) {
  const started = Date.now();
  const headers = { Authorization: `Bearer ${actor.token}` };
  let requestBody;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  let status = null;
  let json = null;
  let error = null;
  try {
    const response = await fetch(`${SAFE_BASE_URL}${path}`, {
      method,
      headers,
      body: requestBody,
    });
    status = response.status;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
  } catch (caught) {
    error = String(caught?.message || caught);
  }

  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const passed = !error && expected.includes(status);
  addResult(operation, passed ? 'PASS' : 'FAIL', {
    method,
    route: path,
    expected_status: expectedStatus,
    observed_status: status,
    operation_id: json?.data?.id ?? null,
    duration_ms: Date.now() - started,
    ...(error ? { error } : {}),
  });
  log(`${passed ? 'OK  ' : 'FAIL'} ${operation} (${method} ${path}) -> ${status}`);
  return { passed, status, json };
}

function listData(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

function assertResult(operation, condition, details = {}) {
  const passed = Boolean(condition);
  addResult(operation, passed ? 'PASS' : 'FAIL', details);
  log(`${passed ? 'OK  ' : 'FAIL'} ${operation}`);
  return passed;
}

function catalogDefinitions(runId) {
  const suffix = String(runId).toUpperCase();
  return [
    {
      key: 'aeroportos',
      code: `SA${suffix}`,
      body: {
        codigo: `SA${suffix}`,
        codigo_icao: `SA${suffix}`,
        nome: `Smoke Aerodromo ${runId}`,
        tipo: 'heliponto',
        descricao: 'Synthetic staging catalog smoke',
        ordem: 91,
      },
    },
    {
      key: 'tipos',
      code: `ST${suffix}`,
      body: {
        codigo: `ST${suffix}`,
        nome: `Smoke Tipo ${runId}`,
        descricao: 'Synthetic staging catalog smoke',
        ordem: 92,
      },
    },
    {
      key: 'naturezas',
      code: `SN${suffix}`,
      body: {
        codigo: `SN${suffix}`,
        nome: `Smoke Natureza ${runId}`,
        descricao: 'Synthetic staging catalog smoke',
        ordem: 93,
      },
    },
    {
      key: 'motivos',
      code: `SM${suffix}`,
      body: {
        codigo: `SM${suffix}`,
        nome: `Smoke Motivo ${runId}`,
        tipo: 'geral',
        descricao: 'Synthetic staging catalog smoke',
        ordem: 94,
      },
    },
  ];
}

async function exerciseCatalog(definition, actors, runId) {
  const basePath = `/api/controle-voos/catalogos/${definition.key}`;
  const viewerBody = {
    ...definition.body,
    codigo: `${definition.code}V`,
    ...(definition.key === 'aeroportos' ? { codigo_icao: `${definition.code}V` } : {}),
  };

  await call({
    operation: `${definition.key}:viewer_create_403`,
    actor: actors.viewerA,
    method: 'POST',
    path: basePath,
    expectedStatus: 403,
    body: viewerBody,
  });

  const created = await call({
    operation: `${definition.key}:manager_create`,
    actor: actors.coordA,
    method: 'POST',
    path: basePath,
    expectedStatus: 201,
    body: definition.body,
  });
  const id = Number(created.json?.data?.id);
  if (!created.passed || !Number.isInteger(id) || id <= 0) {
    assertResult(`${definition.key}:created_id`, false);
    return;
  }
  assertResult(`${definition.key}:created_id`, true, { operation_id: id });

  await call({
    operation: `${definition.key}:duplicate_code_409`,
    actor: actors.coordA,
    method: 'POST',
    path: basePath,
    expectedStatus: 409,
    body: definition.body,
  });

  await call({
    operation: `${definition.key}:cross_tenant_patch_404`,
    actor: actors.adminB,
    method: 'PATCH',
    path: `${basePath}/${id}`,
    expectedStatus: 404,
    body: { nome: `Cross tenant must fail ${runId}` },
  });

  const updatedName = `${definition.body.nome} UPDATED`;
  await call({
    operation: `${definition.key}:manager_patch`,
    actor: actors.coordA,
    method: 'PATCH',
    path: `${basePath}/${id}`,
    expectedStatus: 200,
    body: { nome: updatedName, descricao: 'Updated by staging catalog smoke' },
  });

  const activeRead = await call({
    operation: `${definition.key}:viewer_read_active`,
    actor: actors.viewerA,
    method: 'GET',
    path: `${basePath}?ativo=1`,
    expectedStatus: 200,
  });
  const activeRows = listData(activeRead.json);
  assertResult(
    `${definition.key}:active_visible_after_update`,
    activeRows.some((row) => Number(row?.id) === id && row?.nome === updatedName && Number(row?.ativo) === 1),
    { operation_id: id },
  );

  const tenantBRead = await call({
    operation: `${definition.key}:tenant_b_read`,
    actor: actors.adminB,
    method: 'GET',
    path: `${basePath}?ativo=1`,
    expectedStatus: 200,
  });
  assertResult(
    `${definition.key}:tenant_b_does_not_see_tenant_a`,
    !listData(tenantBRead.json).some((row) => Number(row?.id) === id),
    { operation_id: id },
  );

  await call({
    operation: `${definition.key}:manager_inactivate`,
    actor: actors.coordA,
    method: 'PATCH',
    path: `${basePath}/${id}`,
    expectedStatus: 200,
    body: { ativo: false },
  });

  const activeAfter = await call({
    operation: `${definition.key}:read_active_after_inactivate`,
    actor: actors.viewerA,
    method: 'GET',
    path: `${basePath}?ativo=1`,
    expectedStatus: 200,
  });
  assertResult(
    `${definition.key}:inactive_excluded_from_active`,
    !listData(activeAfter.json).some((row) => Number(row?.id) === id),
    { operation_id: id },
  );

  const inactiveAfter = await call({
    operation: `${definition.key}:read_inactive_after_inactivate`,
    actor: actors.viewerA,
    method: 'GET',
    path: `${basePath}?ativo=0`,
    expectedStatus: 200,
  });
  assertResult(
    `${definition.key}:inactive_preserved`,
    listData(inactiveAfter.json).some((row) => Number(row?.id) === id && Number(row?.ativo) === 0),
    { operation_id: id },
  );
}

function writeReport(runId, ranFully) {
  const failed = operations.filter((entry) => entry.result !== 'PASS').length;
  const dir = mkdtempSync(join(tmpdir(), 'cv-catalog-smoke-'));
  const path = join(dir, 'report.json');
  writeFileSync(
    path,
    JSON.stringify(
      {
        runId,
        target: EXPECTED_HOST,
        ranFully,
        passed: operations.length - failed,
        failed,
        operations,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  chmodSync(path, 0o600);
  process.stdout.write(`${path}\n`);
  return failed === 0 && ranFully;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error('Uso: smoke-controle-voos-catalogs.mjs <manifest.json>');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest?.runId || !manifest?.users) throw new Error('MANIFEST_INVALID');

  const actors = {
    coordA: await login('coordA', manifest.users.coordA),
    viewerA: await login('viewerA', manifest.users.viewerA),
    adminB: await login('adminB', manifest.users.adminB),
  };

  for (const definition of catalogDefinitions(manifest.runId)) {
    await exerciseCatalog(definition, actors, manifest.runId);
  }

  const green = writeReport(manifest.runId, true);
  if (!green) process.exitCode = 1;
}

main().catch((error) => {
  log(`ERRO ${String(error?.message || error)}`);
  process.exitCode = 1;
});
