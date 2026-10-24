#!/usr/bin/env node
/**
 * Protected F0 adapter for the one-candidate F5 staging executor.
 *
 * This module drives the real staging Worker launch page in a browser and
 * verifies its authenticated D1 readback. It deliberately refuses to infer
 * receipt authenticity from hashes copied into an execution plan: the plan
 * must carry the receipt documents whose canonical digests it pins.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(
  process.env.GITHUB_WORKSPACE
    ? `${process.env.GITHUB_WORKSPACE}/package.json`
    : (process.cwd() + '/package.json')
);
const { chromium } = require('@playwright/test');

const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9-]{36}$/i;
const fail = code => { throw new Error(`F5_F0_ADAPTER_${code}`); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};

function checkedScope(plan, params) {
  const c = plan?.candidate, f = plan?.syntheticFixture;
  if (!c || !f || params.tenantId !== c.tenantId || params.courseId !== c.courseId ||
      params.packageSha256 !== c.packageSha256 || params.enrollmentId !== f.enrollmentId ||
      (params.cycleId !== undefined && params.cycleId !== f.cycleId) ||
      (params.runId !== undefined && params.runId !== f.runId)) fail('SCOPE_MISMATCH');
  if (!UUID.test(params.packageId ?? '') || !HEX64.test(c.packageSha256 ?? '') ||
      !HEX40.test(plan.releaseSha ?? '') || !UUID.test(f.runId ?? '')) fail('SCOPE_INVALID');
  return { c, f, packageId: params.packageId };
}

function verifyReceiptDocuments(plan) {
  const { candidate: c, syntheticFixture: f } = plan ?? {};
  const docs = f?.receiptDocuments;
  if (!docs || typeof docs !== 'object') fail('RECEIPT_DOCUMENTS_MISSING');
  const expected = {
    approval: f.approvalReceiptSha256,
    provisioning: f.provisioningReceiptSha256,
    recovery: f.recoveryReceiptSha256,
    cleanupContract: f.cleanupContractSha256,
  };
  for (const [name, digest] of Object.entries(expected)) {
    const doc = docs[name];
    if (!doc || !HEX64.test(digest ?? '') || sha256(canonical(doc)) !== digest ||
        doc.tenantId !== c.tenantId || doc.courseId !== c.courseId ||
        doc.enrollmentId !== f.enrollmentId || doc.cycleId !== f.cycleId ||
        doc.runId !== f.runId || doc.expiresAt !== f.expiresAt || doc.releaseSha !== plan.releaseSha ||
        doc.packageSha256 !== c.packageSha256) fail(`${name.toUpperCase()}_RECEIPT_MISMATCH`);
  }
  if (docs.approval.activation !== false || docs.approval.assessmentApproval !== false ||
      docs.approval.certification !== false || docs.provisioning.synthetic !== true ||
      docs.cleanupContract.deleteRealLearnerData !== false ||
      docs.recovery.action !== 'RESTORE_SYNTHETIC_PREIMAGE') fail('RECEIPT_POLICY_INVALID');
  return true;
}

function locationValue(api, is2004) {
  return api[is2004 ? 'GetValue' : 'LMSGetValue'](is2004 ? 'cmi.location' : 'cmi.core.lesson_location');
}
async function browserExecution({ plan, params, request, env }) {
  const origin = String(env.F5_STAGING_API_ORIGIN || 'https://airtrust-api-staging.airtrust.workers.dev').replace(/\/$/, '');
  const token = env.SCORM_QA_ACCESS_TOKEN;
  if (!token || token.length <= 40) fail('STAGING_ADMIN_TOKEN_NOT_PROVISIONED');
  const path = `/api/lms/scorm/qa-f0/launch/${params.courseId}/${encodeURIComponent(params.packageId)}/${params.enrollmentId}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const assetSession = await request('/api/lms/assets/session', { method: 'POST', body: {
      curso_id: params.courseId, preview: true,
      candidate_package_id: params.packageId,
      candidate_package_sha256: params.packageSha256,
    } });
    if (!assetSession.ok) fail('F0_CANDIDATE_ASSET_SESSION_FAILED');
    const cookie = (assetSession.headers.get('set-cookie') || '').match(/airtrust_lms_asset_token=([^;,]+)/);
    if (!cookie) fail('F0_CANDIDATE_ASSET_COOKIE_MISSING');
    const assetCookieValue = cookie[1];
    const cookieDomain = new URL(origin).hostname;
    await context.addCookies([{ name: 'airtrust_lms_asset_token', value: cookie[1],
      domain: cookieDomain, path: '/api/lms/', httpOnly: true, secure: origin.startsWith('https://'),
      sameSite: 'Lax' }]);
    const page = await context.newPage();
    const launchUrl = `${origin}${path}`;
    await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const frame = page.frameLocator('#scorm-frame');
    await frame.locator('body').waitFor({ state: 'visible', timeout: 45_000 });
    const is2004 = params.scormVersion === '2004';
    if (!['1.2', '2004'].includes(params.scormVersion)) fail('SCORM_VERSION_UNAVAILABLE');
    const marker = `F0:${params.runId}:tripulacao-1`;
    const suspend = JSON.stringify({ runId: params.runId, checkpoint: 'tripulacao-1', resume: true });
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/lms/scorm/qa-f0/commit/') && response.request().method() === 'POST',
      { timeout: 30_000 });
    const first = await page.evaluate(({ is2004, marker, suspend }) => {
      const api = is2004 ? window.API_1484_11 : window.API;
      if (!api) throw Error('SCORM_API_UNAVAILABLE');
      const initialized = is2004 ? api.Initialize('') : api.LMSInitialize('');
      const set = (key, value) => is2004 ? api.SetValue(key, value) : api.LMSSetValue(key, value);
      const commit = is2004 ? api.Commit('') : api.LMSCommit('');
      const locationKey = is2004 ? 'cmi.location' : 'cmi.core.lesson_location';
      const incompleteKey = is2004 ? 'cmi.completion_status' : 'cmi.core.lesson_status';
      const exitKey = is2004 ? 'cmi.exit' : 'cmi.core.exit';
      if (initialized !== 'true' || set(locationKey, marker) !== 'true' ||
          set('cmi.suspend_data', suspend) !== 'true' ||
          set(incompleteKey, 'incomplete') !== 'true' || set(exitKey, 'suspend') !== 'true' ||
          commit !== 'true') throw Error('SCORM_INCOMPLETE_COMMIT_REJECTED');
      return { marker, suspend, apiVersion: is2004 ? '2004' : '1.2' };
    }, { is2004, marker, suspend });
    const firstCommit = await responsePromise;
    if (!firstCommit || !firstCommit.ok()) fail('WORKER_COMMIT_HTTP_FAILED');
    const firstEnvelope = await firstCommit.json();
    if (firstEnvelope?.success !== true || firstEnvelope?.data?.completionWritten !== false ||
        firstEnvelope?.data?.certificateIssued !== false) fail('WORKER_COMMIT_RECEIPT_INVALID');
    const firstReadback = await json(`/api/lms/cursos/${params.courseId}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-evidence/${params.enrollmentId}?sha256=${params.packageSha256}`, { method: 'GET', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET } });
    assertReadback(firstReadback, params, first, plan.releaseSha);
    const finishPromise = page.waitForResponse(response =>
      response.url().includes('/api/lms/scorm/qa-f0/commit/') && response.request().method() === 'POST',
      { timeout: 30_000 });
    await page.evaluate(is2004 => {
      const api = is2004 ? window.API_1484_11 : window.API;
      const result = is2004 ? api.Terminate('') : api.LMSFinish('');
      if (result !== 'true') throw Error('SCORM_FINISH_REJECTED');
    }, is2004);
    if (!(await finishPromise).ok()) fail('WORKER_FINISH_COMMIT_HTTP_FAILED');
    await page.close();

    // A fresh context rules out local storage as the source of a successful
    // resume; the launch must rebuild CMI from the protected Worker/D1 state.
    await context.close();
    const resumedContext = await browser.newContext({ serviceWorkers: 'block' });
    await resumedContext.addCookies([{ name: 'airtrust_lms_asset_token', value: assetCookieValue,
      domain: cookieDomain, path: '/api/lms/', httpOnly: true, secure: origin.startsWith('https://'),
      sameSite: 'Lax' }]);
    const resumedPage = await resumedContext.newPage();
    await resumedPage.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await resumedPage.frameLocator('#scorm-frame').locator('body').waitFor({ state: 'visible', timeout: 45_000 });
    const resumed = await resumedPage.evaluate(({ is2004 }) => {
      const api = is2004 ? window.API_1484_11 : window.API;
      if (!api) throw Error('SCORM_API_UNAVAILABLE');
      const initialized = is2004 ? api.Initialize('') : api.LMSInitialize('');
      if (initialized !== 'true') throw Error('SCORM_RESUME_INITIALIZE_FAILED');
      return {
        location: locationValue(api, is2004),
        suspend: suspendValue(api),
      };
      function locationValue(api, use2004) { return api[use2004 ? 'GetValue' : 'LMSGetValue'](use2004 ? 'cmi.location' : 'cmi.core.lesson_location'); }
      function suspendValue(api) { return api.GetValue ? api.GetValue('cmi.suspend_data') : api.LMSGetValue('cmi.suspend_data'); }
    }, { is2004 });
    if (resumed.location !== first.marker || resumed.suspend !== first.suspend) fail('SCORM_RESUME_STATE_MISMATCH');
    const final = await json(`/api/lms/cursos/${params.courseId}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-evidence/${params.enrollmentId}?sha256=${params.packageSha256}`, { method: 'GET', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET } });
    assertReadback(final, params, first, plan.releaseSha);
    return {
      source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: params.packageId,
      packageSha256: params.packageSha256, enrollmentId: params.enrollmentId,
      cycleId: params.cycleId, runId: params.runId,
      servedPackageSha256: params.packageSha256, committedPackageSha256: params.packageSha256,
      cmiSha256: final.cmiSha256, suspendSha256: final.suspendSha256,
      sessionCount: final.sessionCount, completionStatus: final.completionStatus,
      qualificationHistoryCount: final.qualificationHistoryCount,
      certificateDocument: final.certificateDocument, assessmentAttempted: false,
      assessmentApproved: false, externalAssessmentApproved: false, certificateIssued: false,
      runtimeVersion: first.apiVersion, locationPersisted: true, suspendDataPersisted: true,
      resumeVerified: true,
    };
  } finally {
    await browser.close();
  }

  async function json(pathname, options) {
    const response = await request(pathname, options);
    return response.json().then(payload => {
      if (payload?.success !== true || !payload.data) fail('WORKER_RESPONSE_INVALID');
      return payload.data;
    });
  }
}

function assertReadback(data, params, expected, runtimeSha) {
  if (data?.source !== 'WORKER_D1_STAGING_READBACK' ||
      Number(data.empresaId ?? data.tenantId) !== params.tenantId ||
      Number(data.cursoId ?? data.courseId) !== params.courseId ||
      data.packageId !== params.packageId || data.packageSha256 !== params.packageSha256 ||
      data.runtimeSha !== runtimeSha || data.enrollmentId !== params.enrollmentId ||
      data.cycleId !== params.cycleId || data.runId !== params.runId || data.synthetic !== true ||
      data.servedPackageSha256 !== params.packageSha256 ||
      data.committedPackageSha256 !== params.packageSha256 ||
      !HEX64.test(data.cmiSha256 ?? '') ||
      !HEX64.test(data.suspendSha256 ?? '') || data.suspendSha256 !== sha256(expected.suspend) ||
      !Number.isSafeInteger(data.sessionCount) ||
      data.sessionCount < 1 || data.qualificationHistoryCount !== 0 ||
      data.certificateDocument !== null || data.scormScoreRaw !== null ||
      !['EM_ANDAMENTO', 'NAO_INICIADO'].includes(data.completionStatus) ||
      expected.marker.length < 1 || expected.suspend.length < 1) fail('D1_READBACK_SCOPE_OR_STATE_INVALID');
  return data;
}

/** Creates actual production callbacks; absent recovery/cleanup routes fail closed. */
export async function createF0Adapters({ plan, env = process.env }) {
  return {
    async verifyF0Receipts(candidatePlan) {
      if (candidatePlan !== plan) fail('PLAN_IDENTITY_CHANGED');
      return verifyReceiptDocuments(plan);
    },
    async provisionF0Binding(params, { json }) {
      const { c, f, packageId } = checkedScope(plan, params);
      const result = await json(`/api/lms/cursos/${c.courseId}/scorm-package-versions/${encodeURIComponent(packageId)}/qa-f0/bind`, {
        method: 'POST', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET },
        body: { enrollmentId: f.enrollmentId, cycleId: f.cycleId,
          packageSha256: c.packageSha256, approvalReceiptSha256: f.approvalReceiptSha256,
          runId: f.runId, expiresAt: f.expiresAt },
      });
      if (result?.source !== 'SCORM_F0_STAGING_CANDIDATE_BINDING_V1' ||
          result.tenantId !== c.tenantId || result.courseId !== c.courseId ||
          result.packageId !== packageId || result.packageSha256 !== c.packageSha256 ||
          result.enrollmentId !== f.enrollmentId || result.cycleId !== f.cycleId ||
          result.runId !== f.runId || result.runtimeSha !== plan.releaseSha ||
          result.activePackageChanged !== false || result.certificateIssued !== false ||
          result.completionWritten !== false) fail('F0_BINDING_RECEIPT_INVALID');
      return result;
    },
    async runSyntheticCandidate(params, { request }) {
      checkedScope(plan, params);
      return browserExecution({ plan, params, request, env });
    },
    async recoverSyntheticCandidate(params, { json }) {
      checkedScope(plan, params);
      if (!HEX64.test(params.recoveryReceiptSha256 ?? '') ||
          params.recoveryReceiptSha256 !== plan.syntheticFixture.recoveryReceiptSha256) fail('RECOVERY_RECEIPT_MISMATCH');
      const result = await json(`/api/lms/cursos/${params.courseId}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-f0/recover`, {
        method: 'POST', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET },
        body: { enrollmentId: params.enrollmentId, cycleId: params.cycleId, runId: params.runId,
          packageSha256: plan.candidate.packageSha256, receiptSha256: params.recoveryReceiptSha256 },
      });
      if (result?.verified !== true || result?.syntheticFixtureRecovered !== true ||
          !HEX64.test(result.receiptSha256 ?? '')) fail('RECOVERY_READBACK_INVALID');
      return result;
    },
    async cleanupSyntheticCandidate(params, { json }) {
      checkedScope(plan, params);
      if (params.preserveCandidateInactive !== true) fail('CANDIDATE_PRESERVATION_REQUIRED');
      const result = await json(`/api/lms/cursos/${params.courseId}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-f0/cleanup`, {
        method: 'POST', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET },
        body: { enrollmentId: params.enrollmentId, cycleId: params.cycleId, runId: params.runId,
          packageSha256: plan.candidate.packageSha256,
          receiptSha256: plan.syntheticFixture.cleanupContractSha256 },
      });
      if (result?.verified !== true || result?.syntheticFixtureCleaned !== true ||
          result?.candidatePreservedInactive !== true || !HEX64.test(result.receiptSha256 ?? '')) fail('CLEANUP_READBACK_INVALID');
      return result;
    },
    async removeFailedCandidate(params, { json }) {
      checkedScope(plan, params);
      const result = await json(`/api/lms/cursos/${params.courseId}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-f0/remove-failed-candidate`, {
        method: 'POST', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET },
        body: { packageSha256: plan.candidate.packageSha256, operationId: plan.candidate.operationId },
      });
      if (result?.verified !== true || result?.candidateRemoved !== true || !HEX64.test(result.receiptSha256 ?? '')) fail('FAILED_CANDIDATE_CLEANUP_INVALID');
      return result;
    },
  };
}
