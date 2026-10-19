// Private service only. No public routes, scheduling, fetch-based apply or SQL input.
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { prepareQaEvidence, executeApprovedQaStagingRepair } from '../../scripts/staging/frms-qa-repair-controller.mjs';
import { buildReviewPlan, TARGET } from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import { expectedQaCases } from '../../scripts/staging/inspect-frms-ux-cases.mjs';
import { durableCoordinator, privateR2Store, d1ScopeAdapter, timeTravelReader, LOCK } from './adapters.mjs';
import { authorizePrivateCaller } from './caller-auth.mjs';

const DAYS = Array.from({ length: 30 }, (_, i) => ({
  day: new Date(Date.parse('2026-09-14T00:00:00Z') + i * 86400000).toISOString().slice(0, 10),
  // Only the four reviewed journey dates are used. No scientific coefficients.
  jornadas: i === 29 ? '0' : '5-9',
}));
export function reviewedPlan() {
  const plan = buildReviewPlan(DAYS);
  if (plan.sql_sha256 !== '38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3') throw new Error('QA_REVIEW_DIGEST_MISMATCH');
  return plan;
}

export class FrmsQaCoordinator extends DurableObject {
  async run(operation, input = {}) {
    const env = this.env;
    if (env.ENVIRONMENT !== 'staging' || env.D1_ID !== TARGET.db_id ||
      !/^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') ||
      !/^[a-f0-9]{64}$/.test(env.APPROVAL_KEY_SHA256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(env.PREIMAGE_KEY_HEX ?? '') ||
      !env.DB?.prepare || !env.DB?.batch ||
      !env.PREIMAGES?.put || !env.PREIMAGES?.get ||
      !env.COORDINATOR?.get || !env.COORDINATOR?.idFromName ||
      env.PRIVATE_STORAGE_VERIFIED !== 'restricted-r2-lifecycle-1d') throw new Error('QA_DEPLOYMENT_NOT_READY');
    if (!['prepare', 'apply'].includes(operation)) throw new Error('QA_OPERATION_REJECTED');
    // Input never chooses an ID, SQL statement, binding or authorization anchor.
    const fields = operation === 'prepare' ? ['callerAuth'] :
      ['callerAuth', 'manifest', 'receiptId', 'signatureBase64'];
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key)))
      throw new Error('QA_CALLER_INPUT_REJECTED');
    const caller = await authorizePrivateCaller({
      auth: input.callerAuth, operation, env, storage: this.ctx.storage,
    });
    const plan = reviewedPlan();
    const adapters = {
      ...durableCoordinator(this.ctx.storage),
      ...privateR2Store(env.PREIMAGES),
      ...d1ScopeAdapter({ db: env.DB, plan, expected: expectedQaCases(DAYS) }),
      captureTimeTravel: timeTravelReader({ accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.D1_READ_TOKEN }),
    };
    const key = Buffer.from(env.PREIMAGE_KEY_HEX, 'hex');
    try {
      if (operation === 'prepare') {
        await adapters.audit({event:'FRMS_QA_PRIVATE_CALLER_ACCEPTED',
          operation, runId:caller.runId, runAttempt:caller.runAttempt, writes:0});
        const receipt = await prepareQaEvidence({ plan, adapters, key });
        const receiptId = createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
        await this.ctx.storage.put('receipt:' + receiptId, receipt);
        return { receiptId, receipt };
      }
      await adapters.audit({event:'FRMS_QA_PRIVATE_CALLER_ACCEPTED',
        operation, runId:caller.runId, runAttempt:caller.runAttempt, writes:0});
      if (!/^[a-f0-9]{64}$/.test(input.receiptId ?? '')) throw new Error('QA_RECEIPT_REQUIRED');
      const receipt = await this.ctx.storage.get('receipt:' + input.receiptId);
      if (!receipt) throw new Error('QA_RECEIPT_REQUIRED');
      return await executeApprovedQaStagingRepair({ plan, receipt,
        manifest: input.manifest, signatureBase64: input.signatureBase64,
        publicKeyPem: env.APPROVAL_PUBLIC_KEY_PEM, trustedPublicKeySha256: env.APPROVAL_KEY_SHA256,
        sha: env.RELEASE_SHA, adapters, key });
    } catch (error) {
      // Never return D1 SQL, private rows, tokens or cryptographic material via RPC.
      const message = String(error?.message ?? '');
      throw new Error(/^QA_[A-Z0-9_]+$/.test(message) ? message : 'QA_PRIVATE_EXECUTION_FAILED');
    } finally { key.fill(0); }
  }
}
export default class FrmsQaService extends WorkerEntrypoint {
  fetch() { return new Response('Not found', { status: 404 }); }
  prepare(input) { return this.env.COORDINATOR.get(this.env.COORDINATOR.idFromName(LOCK)).run('prepare', input); }
  apply(input) { return this.env.COORDINATOR.get(this.env.COORDINATOR.idFromName(LOCK)).run('apply', input); }
}
