// Dedicated private service-binding caller capability, NOT an HTTP endpoint.
// A separately protected runner signs an individual prepare/apply invocation;
// possession of any unrelated Worker service binding cannot prepare sensitive
// preimages or submit a privileged apply. Independent Ed25519 is still required.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { TARGET } from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const fail = () => { throw new Error('QA_CALLER_AUTH_REJECTED'); };
const scope = 'FRMS_QA_PRIVATE_RUNNER_999013';
const authority = 'AIRTRUST_GOVERNED_STAGING_RUNNER';
const digest = buf => createHash('sha256').update(buf).digest('hex');

function claimsValid(claims, op, sha, now) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  const fields = ['authority', 'scope', 'operation', 'sha', 'dbId', 'tenantId',
    'runId', 'runAttempt', 'nonce', 'issuedAt', 'expiresAt'];
  if (Object.keys(claims).sort().join('|') !== fields.sort().join('|')) return false;
  const from = Date.parse(claims.issuedAt);
  const to = Date.parse(claims.expiresAt);
  return claims.authority === authority && claims.scope === scope &&
    claims.operation === op && claims.sha === sha && HEX40.test(sha) &&
    claims.dbId === TARGET.db_id && claims.tenantId === 999013 &&
    /^[1-9][0-9]{7,13}$/.test(String(claims.runId)) &&
    Number.isSafeInteger(claims.runAttempt) && claims.runAttempt >= 1 &&
    HEX64.test(String(claims.nonce)) &&
    typeof claims.issuedAt === 'string' && /Z$/.test(claims.issuedAt) &&
    typeof claims.expiresAt === 'string' && /Z$/.test(claims.expiresAt) &&
    Number.isFinite(from) && Number.isFinite(to) &&
    to >= from && to - from <= 120000 &&
    from - now <= 30000 && to >= now;
}

/** Trusted runner only: used offline/in disposable tests until approved infra exists. */
export function signPrivateCaller({keyHex, operation, sha, runId, runAttempt = 1,
  now = new Date()}) {
  if (!HEX64.test(String(keyHex)) || !['prepare', 'apply'].includes(operation) ||
      !HEX40.test(String(sha))) fail();
  const claims = {
    authority, scope, operation, sha, dbId: TARGET.db_id, tenantId: 999013,
    runId: String(runId), runAttempt, nonce: randomBytes(32).toString('hex'),
    issuedAt: now.toISOString(), expiresAt: new Date(+now + 90000).toISOString(),
  };
  if (!claimsValid(claims, operation, sha, +now)) fail();
  return {claims, mac: createHmac('sha256', Buffer.from(keyHex, 'hex'))
    .update(JSON.stringify(claims)).digest('hex')};
}

/** Durable Object ledger makes caller capabilities single-use across replicas. */
export async function authorizePrivateCaller({auth, operation, env, storage,
  now = new Date()}) {
  const keyHex = env?.CALLER_KEY_HEX;
  if (!HEX64.test(String(keyHex)) ||
      !HEX64.test(String(env?.CALLER_KEY_SHA256)) ||
      digest(Buffer.from(keyHex, 'hex')) !== env.CALLER_KEY_SHA256 ||
      !claimsValid(auth?.claims, operation, env?.RELEASE_SHA, +now) ||
      !HEX64.test(String(auth?.mac))) fail();
  const expected = createHmac('sha256', Buffer.from(keyHex, 'hex'))
    .update(JSON.stringify(auth.claims)).digest();
  const supplied = Buffer.from(auth.mac, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) fail();
  const consumed = await storage.transaction(async tx => {
    const key = 'caller-nonce:' + auth.claims.nonce;
    if (await tx.get(key)) return false;
    await tx.put(key, {
      operation, sha: env.RELEASE_SHA, runId: auth.claims.runId,
      runAttempt: auth.claims.runAttempt,
    });
    return true;
  });
  if (!consumed) fail();
  return {runId: auth.claims.runId, runAttempt: auth.claims.runAttempt};
}
