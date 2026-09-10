#!/usr/bin/env node

// A-02 / 0489 staging-only functional verification.
// Uses the two disposable tenants from provision-controle-voos-e2e-fixtures.mjs.
// All mutations go through the public staging API; cleanup is performed by
// cleanup-controle-voos-e2e-fixtures.mjs using the same manifest.

import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev';
const EXPECTED_HOST = 'airtrust-api-staging.airtrust.workers.dev';
const report = [];

function log(message) {
  process.stderr.write(`[a02-0489-functional] ${message}\n`);
}

function assertStagingUrl() {
  const parsed = new URL(BASE_URL);
  if (parsed.protocol !== 'https:' || parsed.hostname !== EXPECTED_HOST) {
    throw new Error('STAGING_API_BASE_URL_NOT_CANONICAL');
  }
}

function syntheticCpf(seed) {
  const base = String(seed).padStart(9, '3').slice(-9).split('').map(Number);
  const digit = (nums, factorStart) => {
    let sum = 0;
    for (let i = 0; i < nums.length; i += 1) sum += nums[i] * (factorStart - i);
    const value = 11 - (sum % 11);
    return value >= 10 ? 0 : value;
  };
  const d1 = digit(base, 10);
  const d2 = digit([...base, d1], 11);
  return [...base, d1, d2].join('');
}

async function login(user, tenant) {
  const started = Date.now();
  let status = null;
  let token = null;
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, senha: user.password }),
    });
    status = response.status;
    const json = await response.json().catch(() => null);
    token = json?.data?.accessToken || null;
  } catch {
    token = null;
  }
  const passed = status === 200 && Boolean(token);
  report.push({
    operation: `login_admin_${tenant.toLowerCase()}`,
    method: 'POST',
    route: '/api/auth/login',
    tenant,
    expected_status: 200,
    observed_status: status,
    result: passed ? 'PASS' : 'FAIL',
    duration_ms: Date.now() - started,
  });
  if (!passed) throw new Error(`LOGIN_${tenant}_FAILED`);
  return { token };
}

async function call({ operation, method, path, actor, tenant, body, expectedStatus }) {
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const started = Date.now();
  let status = null;
  let json = null;
  let transportError = false;
  try {
    const headers = { Authorization: `Bearer ${actor.token}` };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
    status = response.status;
    json = await response.json().catch(() => null);
  } catch {
    transportError = true;
  }
  const passed = !transportError && expected.includes(status);
  report.push({
    operation,
    method,
    route: path.replace(/\/funcionarios\/\d+/g, '/funcionarios/:id'),
    tenant,
    expected_status: expectedStatus,
    observed_status: status,
    response_code: typeof json?.code === 'string' ? json.code : null,
    operation_id: json?.data?.id ?? null,
    result: passed ? 'PASS' : 'FAIL',
    duration_ms: Date.now() - started,
  });
  log(`${passed ? 'PASS' : 'FAIL'} ${operation}: status=${status}`);
  if (!passed) throw new Error(`OPERATION_FAILED:${operation}:${status ?? 'transport'}`);
  return { status, json };
}

function employeeBody({ runId, suffix, cpf, matricula, email, setor }) {
  return {
    nome: `A02 0489 Synthetic ${suffix} ${runId}`,
    cpf,
    matricula,
    email,
    setor,
    cargo: 'QA Synthetic',
    status: 'ATIVO',
  };
}

function writeEvidence(manifest, failure) {
  const required = [
    'login_admin_a',
    'login_admin_b',
    'create_sector_a',
    'create_sector_b',
    'create_shared_keys_tenant_a',
    'create_shared_keys_tenant_b',
    'reject_duplicate_cpf_same_tenant',
    'reject_duplicate_trimmed_matricula_same_tenant',
    'reject_duplicate_normalized_email_same_tenant',
    'soft_delete_original_tenant_a',
    'reuse_keys_after_soft_delete_tenant_a',
    'soft_delete_replacement_tenant_a',
    'reactivate_original_tenant_a',
    'reject_duplicate_after_reactivation_tenant_a',
  ];
  const failed = report.filter((entry) => entry.result !== 'PASS').map((entry) => entry.operation);
  const missing = required.filter(
    (name) => !report.some((entry) => entry.operation === name && entry.result === 'PASS'),
  );
  const ranFully = !failure && failed.length === 0 && missing.length === 0;
  const payload = {
    schema_change: 'a02-natural-keys-tenant-scoped-0489',
    run_id: manifest.runId,
    generated_at: new Date().toISOString(),
    api_host: EXPECTED_HOST,
    tenants: ['A', 'B'],
    ran_fully: ranFully,
    failed_operations: failed,
    missing_required_operations: missing,
    failure: failure || null,
    operations: report,
  };
  const dir = mkdtempSync(join(tmpdir(), 'a02-0489-functional-evidence-'));
  const path = join(dir, 'a02-0489-functional-evidence.json');
  writeFileSync(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
  process.stdout.write(`${path}\n`);
  return ranFully;
}

async function execute(manifest) {
  const adminA = await login(manifest.users.adminA, 'A');
  const adminB = await login(manifest.users.adminB, 'B');
  const sectorNameA = `A02 0489 Synthetic Sector A ${manifest.runId}`;
  const sectorNameB = `A02 0489 Synthetic Sector B ${manifest.runId}`;

  await call({
    operation: 'create_sector_a', method: 'POST', path: '/api/setores', actor: adminA, tenant: 'A',
    expectedStatus: 201,
    body: { codigo: `A02489A${manifest.runId}`.slice(0, 20), nome: sectorNameA },
  });
  await call({
    operation: 'create_sector_b', method: 'POST', path: '/api/setores', actor: adminB, tenant: 'B',
    expectedStatus: 201,
    body: { codigo: `A02489B${manifest.runId}`.slice(0, 20), nome: sectorNameB },
  });

  const sharedCpf = syntheticCpf('314159265');
  const sharedMatricula = `A02-0489-${manifest.runId}`;
  const sharedEmail = `a02.0489.shared.${manifest.runId}@synthetic.invalid`;

  const originalA = await call({
    operation: 'create_shared_keys_tenant_a', method: 'POST', path: '/api/funcionarios', actor: adminA, tenant: 'A',
    expectedStatus: [201, 207],
    body: employeeBody({ runId: manifest.runId, suffix: 'Original A', cpf: sharedCpf, matricula: sharedMatricula, email: sharedEmail, setor: sectorNameA }),
  });
  const originalAId = Number(originalA.json?.data?.id || 0);
  if (!Number.isInteger(originalAId) || originalAId <= 0) throw new Error('ORIGINAL_A_ID_MISSING');

  await call({
    operation: 'create_shared_keys_tenant_b', method: 'POST', path: '/api/funcionarios', actor: adminB, tenant: 'B',
    expectedStatus: [201, 207],
    body: employeeBody({ runId: manifest.runId, suffix: 'Cross Tenant B', cpf: sharedCpf, matricula: sharedMatricula, email: sharedEmail, setor: sectorNameB }),
  });

  await call({
    operation: 'reject_duplicate_cpf_same_tenant', method: 'POST', path: '/api/funcionarios', actor: adminA, tenant: 'A',
    expectedStatus: [400, 409],
    body: employeeBody({ runId: manifest.runId, suffix: 'Duplicate CPF', cpf: sharedCpf, matricula: `${sharedMatricula}-CPF`, email: `a02.0489.cpf.${manifest.runId}@synthetic.invalid`, setor: sectorNameA }),
  });
  await call({
    operation: 'reject_duplicate_trimmed_matricula_same_tenant', method: 'POST', path: '/api/funcionarios', actor: adminA, tenant: 'A',
    expectedStatus: [400, 409],
    body: employeeBody({ runId: manifest.runId, suffix: 'Duplicate Matricula', cpf: syntheticCpf('271828182'), matricula: `  ${sharedMatricula}  `, email: `a02.0489.matricula.${manifest.runId}@synthetic.invalid`, setor: sectorNameA }),
  });
  await call({
    operation: 'reject_duplicate_normalized_email_same_tenant', method: 'POST', path: '/api/funcionarios', actor: adminA, tenant: 'A',
    expectedStatus: [400, 409],
    body: employeeBody({ runId: manifest.runId, suffix: 'Duplicate Email', cpf: syntheticCpf('161803398'), matricula: `${sharedMatricula}-EMAIL`, email: `  ${sharedEmail.toUpperCase()}  `, setor: sectorNameA }),
  });

  await call({
    operation: 'soft_delete_original_tenant_a', method: 'DELETE', path: `/api/funcionarios/${originalAId}`, actor: adminA, tenant: 'A', expectedStatus: 200,
  });

  const replacementA = await call({
    operation: 'reuse_keys_after_soft_delete_tenant_a', method: 'POST', path: '/api/funcionarios', actor: adminA, tenant: 'A',
    expectedStatus: [201, 207],
    body: employeeBody({ runId: manifest.runId, suffix: 'Replacement A', cpf: sharedCpf, matricula: `  ${sharedMatricula}  `, email: sharedEmail.toUpperCase(), setor: sectorNameA }),
  });
  const replacementAId = Number(replacementA.json?.data?.id || 0);
  if (!Number.isInteger(replacementAId) || replacementAId <= 0) throw new Error('REPLACEMENT_A_ID_MISSING');

  await call({
    operation: 'soft_delete_replacement_tenant_a', method: 'DELETE', path: `/api/funcionarios/${replacementAId}`, actor: adminA, tenant: 'A', expectedStatus: 200,
  });
  await call({
    operation: 'reactivate_original_tenant_a', method: 'POST', path: `/api/funcionarios/${originalAId}/reativar`, actor: adminA, tenant: 'A', expectedStatus: 200,
  });
  await call({
    operation: 'reject_duplicate_after_reactivation_tenant_a', method: 'POST', path: '/api/funcionarios', actor: adminA, tenant: 'A',
    expectedStatus: [400, 409],
    body: employeeBody({ runId: manifest.runId, suffix: 'After Reactivation', cpf: sharedCpf, matricula: `${sharedMatricula}-AFTER`, email: `a02.0489.after.${manifest.runId}@synthetic.invalid`, setor: sectorNameA }),
  });
}

async function main() {
  assertStagingUrl();
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error('MANIFEST_PATH_REQUIRED');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest?.runId || !manifest?.empresaA?.id || !manifest?.empresaB?.id) throw new Error('INVALID_TWO_TENANT_MANIFEST');
  if (manifest.dbName !== 'airtrust-db-staging-baseline-20260701') throw new Error('MANIFEST_DB_NOT_CANONICAL_STAGING');

  let failure = null;
  try {
    await execute(manifest);
  } catch (error) {
    failure = String(error?.message || error);
    log(`FAILED: ${failure}`);
  }

  const ranFully = writeEvidence(manifest, failure);
  if (!ranFully) process.exitCode = 1;
}

main().catch((error) => {
  log(`FATAL: ${String(error?.message || error)}`);
  process.exitCode = 1;
});
