#!/usr/bin/env node
/**
 * Staging human-reviewer recovery: existing-user lookup first, never create.
 * No sensitive account identifiers, tokens, email addresses or links in output.
 */
import { pathToFileURL } from 'node:url';
import {
  assertAllowedStagingBaseUrl, extractAccessToken, fetchJson, login, selectEmpresa,
} from '../smoke-auth-common.mjs';
import {
  assertReviewerConfig, getIsolatedQaTenant, acceptSafeInviteReceipt,
} from './invite-native-human-reviewer.mjs';

export function selectExistingReviewer(rows, email) {
  if (!Array.isArray(rows)) throw Error('REVIEWER_EXISTING_USERS_INVALID');
  const matches = rows.filter(row => String(row.email || '').trim().toLowerCase() === email);
  if (matches.length !== 1) throw Error('REVIEWER_EXISTING_ACCOUNT_NOT_UNIQUE');
  const u = matches[0];
  // Name and legacy/global role are NOT reliable tenant identity checks.
  // The catalog blends roles and the invited email may preexist on staging.
  if (!Number.isSafeInteger(Number(u.id)) || Number(u.id) <= 0) {
    throw Error('REVIEWER_EXISTING_ACCOUNT_INVALID_ID');
  }
  return Number(u.id);
}

export function assertReviewerTenantAccess(data, targetId, tenantId) {
  const user = data?.usuario;
  const accesses = data?.acessos;
  if (Number(user?.id) !== targetId || !Array.isArray(accesses)) {
    throw Error('REVIEWER_TENANT_ACCESS_INVALID');
  }
  const selected = accesses.filter(a => Number(a.empresa_id) === tenantId);
  if (accesses.length !== 1 || selected.length !== 1) {
    throw Error('REVIEWER_ISOLATED_TENANT_ACCESS_REQUIRED');
  }
  const access = selected[0];
  const profiles = Array.isArray(access.perfis) ? access.perfis : [];
  if (String(access.role).toLowerCase() !== 'student' ||
      (profiles.length > 0 && !profiles.every(p => String(p).toUpperCase() === 'ALUNO'))) {
    throw Error('REVIEWER_TENANT_ROLE_MISMATCH');
  }
  return true;
}

export function assertBrevoConfigured(metadata) {
  if (metadata?.success !== true || !Array.isArray(metadata.result)) {
    throw Error('REVIEWER_BREVO_METADATA_UNAVAILABLE');
  }
  if (!metadata.result.some(v => v && v.name === 'BREVO_API_KEY')) {
    throw Error('REVIEWER_BREVO_STAGING_SECRET_ABSENT');
  }
  return true;
}

export async function lookupStagingBrevo(env, providerFetch = fetch) {
  const account = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const key = String(env.CLOUDFLARE_WORKER_API_TOKEN || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(account) || !key) throw Error('REVIEWER_CLOUDFLARE_METADATA_CREDENTIALS_MISSING');
  const res = await providerFetch(
    'https://api.cloudflare.com/client/v4/accounts/' + account +
      '/workers/scripts/airtrust-api-staging/secrets',
    { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } },
  );
  if (!res?.ok) throw Error('REVIEWER_CLOUDFLARE_METADATA_DENIED');
  const data = await res.json();
  return assertBrevoConfigured(data);
}

export async function recoverReviewer(env, resend, request = fetchJson,
  authenticate = login, chooseTenant = selectEmpresa, checkBrevo = lookupStagingBrevo) {
  if (env.STAGING_REVIEWER_CONFIRMATION !== 'AIRTRUST_STAGING_REVIEWER_RECOVER') {
    throw Error('REVIEWER_RECOVERY_CONFIRMATION_REQUIRED');
  }
  // Reuse canonical reviewer secret validation after authenticating the recovery intent.
  const cfg = assertReviewerConfig({ ...env,
    STAGING_REVIEWER_CONFIRMATION: 'AIRTRUST_STAGING_REVIEWER_INVITE',
  }, false);
  const base = assertAllowedStagingBaseUrl(env.STAGING_API_BASE_URL);
  const release = await request(base + '/api/version');
  if (release.status !== 200 || release.json?.data?.environment !== 'staging' ||
      release.json?.data?.sourceSha !== cfg.sha) {
    throw Error('REVIEWER_DEPLOYED_SHA_MISMATCH');
  }
  const session = await authenticate(base, cfg.smokeEmail, env.STAGING_SMOKE_PASSWORD);
  let token = extractAccessToken(session);
  const authorized = () => ({ Authorization: 'Bearer ' + token });
  const m = await request(base + '/api/auth/empresas', { headers: authorized() });
  if (m.status !== 200) throw Error('REVIEWER_MEMBERSHIP_ACCESS_DENIED');
  const tenantId = getIsolatedQaTenant(m.json?.data?.empresas);
  if (Number(m.json?.data?.empresaAtualId || 0) !== tenantId) {
    const changed = await chooseTenant(base, token, tenantId);
    if (changed.status !== 200) throw Error('REVIEWER_TENANT_SELECTION_DENIED');
    token = extractAccessToken(changed.json);
  }
  const me = await request(base + '/api/auth/me', { headers: authorized() });
  if (me.status !== 200 || String(me.json?.data?.email || '').toLowerCase() !== cfg.smokeEmail) {
    throw Error('REVIEWER_ADMIN_IDENTITY_MISMATCH');
  }
  const list = await request(base + '/api/empresas/' + tenantId + '/usuarios', {
    headers: authorized(),
  });
  if (list.status !== 200 || list.json?.success !== true) {
    throw Error('REVIEWER_ACCOUNT_READ_DENIED');
  }
  const userId = selectExistingReviewer(list.json?.data, cfg.email);
  const accesses = await request(base + '/api/empresas/usuarios/' + userId + '/acessos', {
    headers: authorized(),
  });
  if (accesses.status !== 200 || accesses.json?.success !== true) {
    throw Error('REVIEWER_TENANT_ACCESS_READ_DENIED');
  }
  assertReviewerTenantAccess(accesses.json.data, userId, tenantId);
  const matched = list.json.data.find(user => Number(user.id) === userId);
  // Read-only diagnostic remains possible even when a preexisting user has
  // a broader legacy/global profile. No credential mutation in that case.
  if (String(matched?.perfil).toUpperCase() !== 'ALUNO') {
    if (resend) throw Error('REVIEWER_GLOBAL_PROFILE_REVIEW_REQUIRED');
    return 'REVIEWER_TENANT_STUDENT_GLOBAL_PROFILE_REVIEW_REQUIRED';
  }
  if (!resend) return 'REVIEWER_EXISTING_ACCOUNT_VERIFIED';
  // Must confirm Brevo is bound BEFORE any token regeneration or D1 mutation.
  await checkBrevo(env);
  const response = await request(base + '/api/admin/usuarios/' + userId + '/invite', {
    method: 'POST', headers: { ...authorized(), 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (response.status !== 200) throw Error('REVIEWER_RESEND_FAILED');
  // The admin route returns inviteToken/inviteLink; never return or log either.
  return acceptSafeInviteReceipt({
    success: response.json?.success,
    data: { emailSent: response.json?.data?.emailSent,
      conviteUrl: response.json?.data?.inviteLink },
  });
}

async function main() {
  const result = await recoverReviewer(process.env, process.argv.includes('--resend'));
  console.log(result);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    const code = String(err?.message || '');
    console.error(/^REVIEWER_[A-Z_]+$/.test(code) ? code : 'REVIEWER_RECOVERY_FAILED');
    process.exitCode = 1;
  });
}
