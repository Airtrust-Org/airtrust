#!/usr/bin/env node
/** Governed human staging invitation, never SCORM, production or SQL. */
import { pathToFileURL } from 'node:url';
import {
  assertAllowedStagingBaseUrl, extractAccessToken, fetchJson, login, selectEmpresa,
} from '../smoke-auth-common.mjs';

export function assertReviewerConfig(env, apply) {
  const email = String(env.STAGING_NATIVE_REVIEWER_EMAIL || '').trim().toLowerCase();
  const smokeEmail = String(env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
  const sha = String(env.EXPECTED_STAGING_SOURCE_SHA || '').trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email) || email.length > 254 ||
      email.endsWith('@staging.airtrust.invalid')) throw Error('REVIEWER_EMAIL_INVALID');
  if (smokeEmail !== 'qa-agent@staging.airtrust.invalid' ||
      !env.STAGING_SMOKE_PASSWORD) throw Error('REVIEWER_QA_ADMIN_SECRET_REQUIRED');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('REVIEWER_SHA_INVALID');
  if (env.STAGING_REVIEWER_CONFIRMATION !== 'AIRTRUST_STAGING_REVIEWER_INVITE') {
    throw Error('REVIEWER_CONFIRMATION_REQUIRED');
  }
  return { email, smokeEmail, sha, apply };
}

export function getIsolatedQaTenant(companies) {
  if (!Array.isArray(companies)) throw Error('REVIEWER_TENANTS_INVALID');
  const tenant = companies.find(c => c.codigo === 'airtrust_smoke');
  if (!tenant || !Number.isSafeInteger(Number(tenant.id)) || Number(tenant.id) <= 0 ||
      !['admin', 'manager'].includes(String(tenant.role).toLowerCase())) {
    throw Error('REVIEWER_ISOLATED_QA_TENANT_REQUIRED');
  }
  return Number(tenant.id);
}

export function acceptSafeInviteReceipt(payload) {
  if (payload?.success !== true || payload?.data?.emailSent !== true) {
    throw Error('REVIEWER_INVITE_DELIVERY_UNCONFIRMED');
  }
  let url;
  try { url = new URL(payload.data.conviteUrl); } catch { throw Error('REVIEWER_INVITE_URL_INVALID'); }
  if (url.origin !== 'https://staging.airtrust.pages.dev' ||
      url.pathname !== '/aceitar-convite' || !url.searchParams.get('token')) {
    throw Error('REVIEWER_INVITE_URL_NOT_STAGING');
  }
  return 'REVIEWER_INVITATION_DELIVERED';
}

export async function runInvitation(env, apply, request = fetchJson, authenticate = login,
  chooseTenant = selectEmpresa) {
  const config = assertReviewerConfig(env, apply);
  const base = assertAllowedStagingBaseUrl(env.STAGING_API_BASE_URL);
  const v = await request(base + '/api/version');
  if (v.status !== 200 || v.json?.data?.environment !== 'staging' ||
      v.json?.data?.sourceSha !== config.sha) throw Error('REVIEWER_DEPLOYED_SHA_MISMATCH');
  const loginResult = await authenticate(base, config.smokeEmail, env.STAGING_SMOKE_PASSWORD);
  let token = extractAccessToken(loginResult);
  const auth = () => ({ Authorization: 'Bearer ' + token });
  const membership = await request(base + '/api/auth/empresas', { headers: auth() });
  if (membership.status !== 200) throw Error('REVIEWER_MEMBERSHIP_ACCESS_DENIED');
  const tenantId = getIsolatedQaTenant(membership.json?.data?.empresas);
  if (Number(membership.json?.data?.empresaAtualId || 0) !== tenantId) {
    const selected = await chooseTenant(base, token, tenantId);
    if (selected.status !== 200) throw Error('REVIEWER_TENANT_SELECTION_DENIED');
    token = extractAccessToken(selected.json);
  }
  const identity = await request(base + '/api/auth/me', { headers: auth() });
  if (identity.status !== 200 ||
      String(identity.json?.data?.email || '').toLowerCase() !== config.smokeEmail) {
    throw Error('REVIEWER_ADMIN_IDENTITY_MISMATCH');
  }
  if (!apply) return 'REVIEWER_STAGING_PREFLIGHT_READY';
  const invitation = await request(base + '/api/empresas/' + tenantId + '/usuarios/invite', {
    method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.email, nome: 'Revisor de treinamentos',
      role: 'student', perfis: ['student'], empresaIds: [tenantId],
    }),
  });
  if (invitation.status !== 200) throw Error('REVIEWER_INVITE_REJECTED');
  // Never return the URL, token, email or recipient data to a workflow log.
  return acceptSafeInviteReceipt(invitation.json);
}

async function main() {
  const result = await runInvitation(process.env, process.argv.includes('--apply'));
  console.log(result);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    const code = String(err?.message || '');
    console.error(/^REVIEWER_[A-Z_]+$/.test(code) ? code : 'REVIEWER_FAILED');
    process.exitCode = 1;
  });
}
