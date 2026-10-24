#!/usr/bin/env node
/**
 * BOA/CBMMG — strictly READ-ONLY staging validation for 130 synthetic crew JWTs.
 *
 * OFF by default. Requires explicit approved STAGING target, 130 UNIQUE test
 * credentials supplied out of repo, and acknowledgement. Never emits JWTs,
 * response bodies, staff IDs, health answers or other personal information.
 *
 * Usage: BOA_QA_READONLY_APPROVED=SIM BOA_QA_STAGING_BASE_URL=https://staging.example.test \
 *   BOA_QA_EXPECTED_TENANT_ID=130 BOA_QA_TOKENS_FILE=/private/qa-tokens.json \
 *   BOA_QA_CONCURRENCY=20 node scripts/validation/boa/staging-130-readonly.mjs
 *
 * JSON file outside repository: [{"label":"BOA-QA-001","token":"<test access JWT>"}, ...]
 */
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

function required(name) {
  const val = process.env[name];
  if (typeof val !== 'string' || !val.trim()) throw new Error(`Missing ${name}`);
  return val.trim();
}
function nonprodStagingUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('HTTPS staging URL required');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use the bare staging origin only');
  }
  const host = url.hostname.toLowerCase();
  if (!/(^|[-.])(staging|dev)([-.]|$)/.test(host)
    || /(^|[-.])(prod|production)([-.]|$)/.test(host)) {
    throw new Error('Nonproduction staging/dev hostname required');
  }
  return url.origin;
}
function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * p) - 1];
}

async function main() {
  if (process.env.BOA_QA_READONLY_APPROVED !== 'SIM') {
    throw new Error('Explicit BOA_QA_READONLY_APPROVED=SIM is required');
  }
  const base = nonprodStagingUrl(required('BOA_QA_STAGING_BASE_URL'));
  const tenantId = Number(required('BOA_QA_EXPECTED_TENANT_ID'));
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || tenantId === 6) {
    throw new Error('Invalid BOA tenant, empresa 6 is forbidden');
  }
  const concurrency = Number(process.env.BOA_QA_CONCURRENCY ?? '20');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 130) {
    throw new Error('BOA_QA_CONCURRENCY must be an integer 1–130');
  }
  const path = required('BOA_QA_TOKENS_FILE');
  if (!isAbsolute(path)) throw new Error('Credentials file must have an absolute path');
  const sourcePath = realpathSync(path);
  const relativeToRepo = relative(process.cwd(), sourcePath);
  if (!relativeToRepo.startsWith('..') && !isAbsolute(relativeToRepo)) {
    throw new Error('Credentials file must be outside the repository');
  }
  // Never print parser errors: JSON errors can include snippets of secret JWTs.
  let users;
  try { users = JSON.parse(readFileSync(sourcePath, 'utf8')); }
  catch { throw new Error('Invalid or unreadable external credentials file'); }
  if (!Array.isArray(users) || users.length !== 130) {
    throw new Error('Exactly 130 distinct synthetic credentials are required');
  }
  const labels = new Set(), tokens = new Set();
  for (const user of users) {
    if (!user || typeof user !== 'object'
      || !/^BOA-QA-\d{3}$/.test(user.label)
      || typeof user.token !== 'string'
      || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(user.token)
      || labels.has(user.label) || tokens.has(user.token)) {
      throw new Error('Invalid, duplicate or non-synthetic credential');
    }
    labels.add(user.label);
    tokens.add(user.token);
  }
  const results = new Array(users.length);
  let next = 0;
  async function runner() {
    while (next < users.length) {
      const index = next++;
      const started = performance.now();
      let status = 0, outcome = 'ERROR';
      try {
        const response = await fetch(`${base}/api/bombeiros/frms/checkin/status`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${users[index].token}`,
            Accept: 'application/json', 'Cache-Control': 'no-store' },
          redirect: 'error',
          signal: AbortSignal.timeout(12000),
        });
        status = response.status;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          if (status === 200 && json?.success === true
            && json?.meta?.tenant_id === tenantId
            && json?.data?.dispatch_permission === 'NOT_GRANTED'
            && json?.data?.human_review_required === true
            && typeof json?.data?.received === 'boolean') {
            // Fail if the endpoint inadvertently returns sensitive signals.
            const dataKeys = Object.keys(json?.data ?? {});
            const forbidden = ['kss_reported','sleep_hours_24h','funcionario_id',
              'pvt_60s_completed','self_declared_unfit','empresa_id'];
            outcome = forbidden.some(key => dataKeys.includes(key)) ? 'LEAK' : 'PASS';
          } else {
            outcome = 'INVALID_RESPONSE';
          }
        } else {
          outcome = 'NON_JSON_RESPONSE';
        }
      } catch {
        outcome = 'NETWORK_OR_TIMEOUT_ERROR';
      }
      results[index] = {
        status, outcome, ms: Math.round(performance.now() - started),
      };
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => runner()));
  const latency = results.map(x => x.ms).sort((a,b) => a-b);
  const distribution = Object.fromEntries(
    [...new Set(results.map(x => x.outcome))]
      .sort().map(key => [key, results.filter(x => x.outcome === key).length]),
  );
  const success = results.every(x => x.outcome === 'PASS');
  console.log(JSON.stringify({
    suite: 'BOA_STAGING_130_READONLY_V1',
    approved_environment: 'STAGING_ONLY',
    users: 130, concurrency, success,
    summary: distribution,
    latency_ms: {
      min: latency[0], p50: percentile(latency, 0.50),
      p95: percentile(latency, 0.95),
      p99: percentile(latency, 0.99), max: latency[latency.length - 1],
    },
    evidence_limitations: [
      'Read-only; not a write or mission workload',
      'Requires a configured, scientifically and legally approved synthetic staging tenant',
      'Does not demonstrate official tender acceptance, cloud data recovery or PVT validity',
    ],
  }));
  if (!success) process.exitCode = 1;
}
main().catch(() => {
  // Never log caught exception messages: JSON and fetch errors can contain JWTs.
  console.error('BOA QA validation blocked: prerequisites incomplete or execution refused.');
  process.exitCode = 1;
});
