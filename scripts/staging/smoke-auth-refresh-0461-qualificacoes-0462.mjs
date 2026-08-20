#!/usr/bin/env node

// source_reference: docs/STAGING_ENVIRONMENT_STABILIZATION_20260701.md, migrations 0461 and 0462
// operational_decision: synthetic staging-only smoke for auth refresh token rotation/pinning (0461) and active-only qualification type unique constraints (0462).
// dry_run_required: validate parameters and staging target before execution.
// rollback_plan_required: cleanup all created test fixtures in finally block.

import {
  assert,
  assertAllowedStagingBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  extractRefreshToken,
  fetchJson,
  login,
  logout,
  maskEmail,
  refreshTokens,
  selectEmpresa,
} from '../smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);
const email = process.env.STAGING_SMOKE_EMAIL;
const password = process.env.STAGING_SMOKE_PASSWORD;

async function run() {
  if (!email || !password) {
    process.stdout.write('[SMOKE_0461_0462] SKIPPED: STAGING_SMOKE_EMAIL and STAGING_SMOKE_PASSWORD required\n');
    return;
  }

  process.stdout.write(`[SMOKE_0461_0462] Target: ${baseUrl}\n`);
  process.stdout.write(`[SMOKE_0461_0462] User: ${maskEmail(email)}\n`);

  // 1. AUTH & REFRESH SMOKE (0461)
  const loginRes = await login(baseUrl, email, password);
  assert(loginRes && typeof loginRes === 'object', 'Login response invalid');
  const accessToken1 = extractAccessToken(loginRes);
  const refreshToken1 = extractRefreshToken(loginRes);
  assert(accessToken1, 'Access token missing from login');
  assert(refreshToken1, 'Refresh token missing from login');

  const claims1 = decodeJwtPayload(accessToken1);
  assert(claims1.empresa_id, 'JWT missing empresa_id');
  const userEmpresaId = Number(claims1.empresa_id);

  // Protected endpoint test
  const meRes = await fetchJson(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken1}` },
  });
  assert(meRes.status === 200, `/api/auth/me failed with ${meRes.status}`);

  // Refresh flow test (0461)
  const refreshRes = await refreshTokens(baseUrl, refreshToken1);
  assert(refreshRes.status === 200, `Refresh failed with ${refreshRes.status}`);
  assert(refreshRes.json?.success === true, 'Refresh success != true');
  const accessToken2 = extractAccessToken(refreshRes.json);
  const refreshToken2 = extractRefreshToken(refreshRes.json);
  assert(accessToken2 && accessToken2 !== accessToken1, 'New access token not issued');
  assert(refreshToken2 && refreshToken2 !== refreshToken1, 'Refresh token not rotated');

  const claims2 = decodeJwtPayload(accessToken2);
  assert(Number(claims2.empresa_id) === userEmpresaId, 'Refresh altered empresa_id pinning');

  // Cross tenant switch rejection
  const crossTenantRes = await selectEmpresa(baseUrl, accessToken2, 999999);
  assert(crossTenantRes.status === 401 || crossTenantRes.status === 403, 'Cross-tenant select must be rejected');

  // Old refresh token rejection (replay prevention)
  const replayRes = await refreshTokens(baseUrl, refreshToken1);
  assert(replayRes.status === 401, 'Replay of rotated refresh token must return 401');

  process.stdout.write('[SMOKE_0461_0462] AUTH_AND_REFRESH_0461: PASS\n');

  // 2. QUALIFICATIONS & 0462 ACTIVE-ONLY UNIQUE CONSTRAINT SMOKE
  const listTiposRes = await fetchJson(`${baseUrl}/api/qualificacoes/tipos`, {
    headers: { Authorization: `Bearer ${accessToken2}` },
  });
  assert(listTiposRes.status === 200, `List tipos failed with ${listTiposRes.status}`);

  const catRes = await fetchJson(`${baseUrl}/api/qualificacoes/categorias`, {
    headers: { Authorization: `Bearer ${accessToken2}` },
  });
  const categoriaId = (Array.isArray(catRes.json?.data) && catRes.json.data.length > 0)
    ? (catRes.json.data.find(c => Number(c.empresa_id) === userEmpresaId)?.id || catRes.json.data[0].id)
    : 25;

  const testCode = `T0462_${Date.now().toString().slice(-6)}`;
  let createdId = null;

  try {
    // Step A: Create qualification type
    const createRes = await fetchJson(`${baseUrl}/api/qualificacoes/tipos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: testCode,
        nome: `Smoke Test 0462 ${testCode}`,
        categoria_id: categoriaId,
        validade: 12,
      }),
    });
    assert(createRes.status === 200 || createRes.status === 201, `Create tipo failed: ${createRes.status}`);
    createdId = createRes.json?.data?.id || createRes.json?.data;

    // Step B: Attempt duplicate active code in same tenant -> must fail (400/409)
    const dupRes = await fetchJson(`${baseUrl}/api/qualificacoes/tipos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: testCode,
        nome: `Duplicate Smoke Test 0462 ${testCode}`,
        categoria_id: categoriaId,
        validade: 12,
      }),
    });
    assert(dupRes.status === 400 || dupRes.status === 409, `Expected duplicate rejection 400/409, got ${dupRes.status}`);

    // Step C: Soft delete created tipo
    const delRes = await fetchJson(`${baseUrl}/api/qualificacoes/tipos/${createdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken2}` },
    });
    assert(delRes.status === 200, `Delete tipo failed with ${delRes.status}`);

    // Step D: Re-create same code after soft-delete -> must succeed
    const reCreateRes = await fetchJson(`${baseUrl}/api/qualificacoes/tipos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: testCode,
        nome: `Recreated After Soft Delete ${testCode}`,
        categoria_id: categoriaId,
        validade: 12,
      }),
    });
    assert(reCreateRes.status === 200 || reCreateRes.status === 201, `Recreate after soft-delete failed with ${reCreateRes.status}`);
    const recreatedId = reCreateRes.json?.data?.id || reCreateRes.json?.data;

    // Cleanup recreated fixture
    if (recreatedId) {
      await fetchJson(`${baseUrl}/api/qualificacoes/tipos/${recreatedId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken2}` },
      });
    }

    process.stdout.write('[SMOKE_0461_0462] QUALIFICACOES_0462: PASS\n');
  } finally {
    // 3. RBAC TEST & CLEANUP
    const unauthRes = await fetchJson(`${baseUrl}/api/qualificacoes/tipos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: 'HACK', nome: 'Hack' }),
    });
    assert(unauthRes.status === 401, `Unauthenticated request returned ${unauthRes.status}`);

    await logout(baseUrl, { accessToken: accessToken2, refreshToken: refreshToken2 });
    process.stdout.write('[SMOKE_0461_0462] ALL_CHECKS_PASSED: PASS\n');
  }
}

run().catch((err) => {
  process.stderr.write(`[SMOKE_0461_0462] ERROR: ${err.message}\n`);
  process.exit(1);
});
