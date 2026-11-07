#!/usr/bin/env node
/** Authenticated F5 Worker adapters. No direct D1/R2 access is used here. */
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { verify as verifyF0Grant } from './f5-candidate-approval-guard.mjs';
import { assertLiveFrontendShaFromOrigin } from '../../e2e/lib/live-sha-guard.mjs';

const API_DEFAULT = 'https://airtrust-api-staging.airtrust.workers.dev';
const PAGES_DEFAULT = 'https://staging.airtrust.pages.dev';
const ASSET_COOKIE = 'airtrust_lms_asset_token';
const HEX64 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const fail = code => { throw new Error(`F5_WORKER_ADAPTER_${code}`); };

function ids(params) {
  const tenantId = Number(params?.tenantId ?? params?.empresaId);
  const courseId = Number(params?.courseId ?? params?.cursoId);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 ||
      !Number.isSafeInteger(courseId) || courseId <= 0) fail('TENANT_COURSE_INVALID');
  return { tenantId, courseId };
}

async function hashResponseBody(response, maxBytes = 16 * 1024 * 1024) {
  if (!response.body) fail('ASSET_BODY_MISSING');
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) fail('ASSET_READBACK_TOO_LARGE');
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { sha256: hash.digest('hex'), size };
}

/** Range-readable private package source; only one bounded chunk is resident. */
export async function openF5PrivateZipSource(path) {
  if (!path) fail('PRIVATE_ZIP_PATH_REQUIRED');
  const handle = await open(path, 'r');
  const { size } = await handle.stat();
  return {
    size,
    async read(offset, length) {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1) {
        fail('PRIVATE_ZIP_RANGE_INVALID');
      }
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
    },
    close: () => handle.close(),
  };
}

/**
 * Binds the executor to the current governed Worker APIs. F0-owned QA
 * provisioning/recovery callbacks are required inputs and fail closed when
 * absent; preview-only endpoints are intentionally not promoted to execution.
 */
export function createF5WorkerAdapters({
  env = process.env,
  fetchImpl = fetch,
  verifyF0Receipts,
  provisionF0Binding,
  runSyntheticCandidate,
  recoverSyntheticCandidate,
  cleanupSyntheticCandidate,
  removeFailedCandidate,
} = {}) {
  const origin = String(env.F5_STAGING_API_ORIGIN || API_DEFAULT).replace(/\/$/, '');
  const pagesOrigin = String(env.F5_STAGING_PAGES_ORIGIN || PAGES_DEFAULT).replace(/\/$/, '');
  const token = env.SCORM_QA_ACCESS_TOKEN;
  const readbackSecret = env.SCORM_QA_READBACK_SECRET;

  async function request(path, options = {}) {
    if (!token || token.length <= 40) fail('STAGING_ADMIN_TOKEN_NOT_PROVISIONED');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body instanceof Uint8Array || Buffer.isBuffer(options.body)) {
      headers.set('Content-Type', 'application/octet-stream');
    } else if (options.body !== undefined && typeof options.body !== 'string') {
      headers.set('Content-Type', 'application/json');
      options = { ...options, body: JSON.stringify(options.body) };
    }
    const response = await fetchImpl(`${origin}${path}`, { ...options, headers,
      redirect: 'error', signal: options.signal || AbortSignal.timeout(30_000) });
    if (!response.ok) {
      // A Worker error body can contain request/learner data. Do not read or
      // embed it in an exception that could reach Actions or another caller.
      const status = Number.isInteger(response.status) &&
        response.status >= 100 && response.status <= 599 ? response.status : 0;
      fail(`WORKER_HTTP_${status}`);
    }
    return response;
  }
  const json = async (path, options) => {
    const payload = await (await request(path, options)).json();
    if (payload?.success !== true || !('data' in payload)) fail('WORKER_RESPONSE_CONTRACT_INVALID');
    return payload.data;
  };
  const coursePath = courseId => `/api/lms/cursos/${courseId}`;

  return {
    async verifyAuthorization(plan) {
      const c = plan.candidate;
      return verifyF0Grant({
        repo: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME,
        actor: env.GITHUB_ACTOR, confirmation: env.F5_CONFIRMATION,
        sha: plan.releaseSha, grantId: env.F5_GRANT_ID,
        tenantId: String(c.tenantId), courseId: String(c.courseId),
        packageSha256: c.packageSha256, zipBytes: String(c.zipBytes), operationId: c.operationId,
      }, env.GITHUB_TOKEN, async path => {
        const response = await fetchImpl(`https://api.github.com/repos/Airtrust-Org/airtrust/${path}`, {
          headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
          redirect: 'error', signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) fail(`GITHUB_READ_${response.status}`);
        return response.json();
      });
    },

    async readRuntimeProvenance() {
      const response = await fetchImpl(`${origin}/api/version`, {
        headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) fail(`VERSION_HTTP_${response.status}`);
      const payload = await response.json();
      const data = payload?.data ?? payload;
      const expectedReleaseSha = env.F5_RELEASE_SHA;
      if (payload?.success !== true || data?.environment !== 'staging' ||
          !/^[a-f0-9]{40}$/.test(data?.sourceSha ?? '') ||
          !/^[a-f0-9]{40}$/.test(expectedReleaseSha ?? '') || data.sourceSha !== expectedReleaseSha) {
        fail('WORKER_PROVENANCE_INVALID');
      }
      await assertLiveFrontendShaFromOrigin(pagesOrigin, expectedReleaseSha.slice(0, 7), fetchImpl);
      return { workerSha: data.sourceSha, pagesSha: expectedReleaseSha.slice(0, 7), harnessSha: env.GITHUB_SHA };
    },

    async verifyF0Receipts(plan) {
      if (typeof verifyF0Receipts !== 'function') fail('F0_RECEIPT_VERIFIER_NOT_PROVISIONED');
      return verifyF0Receipts(plan);
    },

    async beginIntake(params) {
      const { courseId } = ids(params);
      if (!UUID.test(params.operationId ?? '') || !HEX64.test(params.packageSha256 ?? '') ||
          !Number.isSafeInteger(params.zipBytes)) fail('INTAKE_IDENTITY_INVALID');
      return json(`${coursePath(courseId)}/scorm-upload/streamed/init`, {
        method: 'POST', body: { operation_id: params.operationId,
          expected_sha256: params.packageSha256, zip_bytes: params.zipBytes,
          arquivo_nome: `f5-${params.packageSha256}-${params.operationId}.zip` },
      });
    },

    async putIntakePart(params) {
      const { courseId } = ids(params);
      if (!UUID.test(params.operationId ?? '') || !Number.isSafeInteger(params.partNumber) ||
          params.partNumber < 1 || !(params.bytes instanceof Uint8Array) ||
          params.contentLength !== params.bytes.byteLength) fail('INTAKE_PART_INVALID');
      return json(`${coursePath(courseId)}/scorm-upload/streamed/${params.operationId}/parts/${params.partNumber}`, {
        method: 'PUT', headers: { 'Content-Length': String(params.contentLength) }, body: params.bytes,
      });
    },

    async completeIntake(params) {
      const { courseId } = ids(params);
      return json(`${coursePath(courseId)}/scorm-upload/streamed/${params.operationId}/complete`, { method: 'POST' });
    },

    async abortIntake(params) {
      const { courseId } = ids(params);
      return json(`${coursePath(courseId)}/scorm-upload/streamed/${params.operationId}/abort`, { method: 'POST' });
    },

    async resolveAmbiguousIntake(params) {
      const { courseId } = ids(params);
      if (!UUID.test(params.operationId ?? '') || !HEX64.test(params.packageSha256 ?? '')) {
        fail('AMBIGUOUS_INTAKE_IDENTITY_INVALID');
      }
      const result = await json(`${coursePath(courseId)}/scorm-upload/streamed/${params.operationId}/status?sha256=${params.packageSha256}`,
        { method: 'GET' });
      // A successful status response is not proof of this operation's identity.
      // A cross-operation/tenant response must never authorize compensation.
      if (result?.source !== 'WORKER_F5_INTAKE_STATUS' ||
          result.operationId !== params.operationId ||
          !['INTAKE_PRESENT', 'CANDIDATE_PRESENT', 'CLEAN'].includes(result.state) ||
          (result.state === 'INTAKE_PRESENT' &&
            result.packageSha256 !== params.packageSha256)) {
        fail('AMBIGUOUS_INTAKE_READBACK_INVALID');
      }
      if (result.state === 'CANDIDATE_PRESENT' &&
          (result.candidate?.packageSha256 !== params.packageSha256 ||
           result.candidate?.active !== false ||
           result.candidate?.createdByOperation !== true || result.candidate?.alreadyExisted !== false)) {
        fail('AMBIGUOUS_CANDIDATE_OWNERSHIP_UNPROVEN');
      }
      return { ...result, verified: true };
    },

    async readCandidateD1(params) {
      const { tenantId, courseId } = ids(params);
      const rows = await json(`${coursePath(courseId)}/scorm-package-versions`, { method: 'GET' });
      const row = Array.isArray(rows) && rows.find(item => item.packageId === params.packageId &&
        item.packageSha256 === params.packageSha256);
      if (!row) fail('D1_CANDIDATE_NOT_FOUND');
      if (typeof row.active !== 'boolean') fail('D1_CANDIDATE_ACTIVE_STATE_MISSING');
      const empresaId = Number(row.empresaId ?? row.empresa_id ?? row.tenantId);
      const cursoId = Number(row.cursoId ?? row.curso_id ?? row.courseId);
      if (empresaId !== tenantId || cursoId !== courseId) fail('D1_TENANT_COURSE_MISMATCH');
      return {
        source: 'WORKER_D1_CANDIDATE_READBACK', tenantId: empresaId, courseId: cursoId,
        packageId: row.packageId, packageSha256: row.packageSha256, status: row.status,
        active: row.active === true, r2Prefix: row.r2Prefix, launchFile: row.launchFile,
        scormVersion: row.scormVersion,
      };
    },

    async readCandidateR2(params) {
      const { tenantId, courseId } = ids(params);
      // The candidate asset endpoint accepts only a short-lived lms_asset
      // cookie minted from the authenticated access token; it does not accept
      // an ordinary bearer token as a candidate asset scope.
      const session = await request('/api/lms/assets/session', { method: 'POST', body: {
        curso_id: courseId, preview: true, candidate_package_id: params.packageId,
        candidate_package_sha256: params.packageSha256,
      } });
      const cookieHeader = session.headers.get('set-cookie') || '';
      const cookieMatch = cookieHeader.match(new RegExp(`(?:^|,\\s*)${ASSET_COOKIE}=([^;,]+)`));
      if (!cookieMatch) fail('CANDIDATE_ASSET_SESSION_COOKIE_MISSING');
      const assetCookie = `${ASSET_COOKIE}=${cookieMatch[1]}`;
      const url = `${origin}/api/lms/scorm/qa-assets/${tenantId}/${courseId}/${encodeURIComponent(params.packageId)}/${params.launchFile.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetchImpl(url, {
        headers: { Cookie: assetCookie }, redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) fail(`CANDIDATE_ASSET_HTTP_${response.status}`);
      const measured = await hashResponseBody(response);
      if (measured.sha256 !== params.expectedSha256) fail('CANDIDATE_ASSET_SHA_MISMATCH');
      return { source: 'WORKER_R2_CANDIDATE_ASSET_READBACK', packageId: params.packageId,
        packageSha256: params.packageSha256, assetSha256: measured.sha256, active: false,
        bytes: measured.size };
    },

    async readQaEvidence(params) {
      const { courseId } = ids(params);
      if (!readbackSecret || readbackSecret.length < 32) fail('READBACK_SECRET_NOT_PROVISIONED');
      if (params.phase === 'BEFORE') {
        if (typeof provisionF0Binding !== 'function') fail('F0_BINDING_PROVISIONER_NOT_PROVISIONED');
        await provisionF0Binding(params, { request, json });
      }
      const data = await json(`${coursePath(courseId)}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-evidence/${params.enrollmentId}?sha256=${params.packageSha256}`, {
        method: 'GET', headers: { 'X-Airtrust-F5-QA-Readback': readbackSecret },
      });
      // Worker canonical tenant keys are empresaId/cursoId. Normalize only
      // after checking both; never infer scope from the request alone.
      const tenantId = Number(data.empresaId ?? data.tenantId);
      const courseIdFromWorker = Number(data.cursoId ?? data.courseId);
      const requested = ids(params);
      if (tenantId !== requested.tenantId || courseIdFromWorker !== requested.courseId) {
        fail('QA_READBACK_TENANT_COURSE_MISMATCH');
      }
      return {
        source: data.source, tenantId, courseId: courseIdFromWorker,
        packageId: data.packageId, packageSha256: data.packageSha256,
        runtimeSha: data.runtimeSha, enrollmentId: data.enrollmentId, cycleId: data.cycleId,
        runId: data.runId, approvalReceiptSha256: data.approvalReceiptSha256,
        servedPackageSha256: data.servedPackageSha256,
        committedPackageSha256: data.committedPackageSha256,
        synthetic: data.synthetic, completionStatus: data.completionStatus,
        cmiSha256: data.cmiSha256, suspendSha256: data.suspendSha256,
        sessionCount: data.sessionCount, qualificationHistoryCount: data.qualificationHistoryCount,
        certificateDocument: data.certificateDocument, scormScoreRaw: data.scormScoreRaw,
      };
    },

    async runSyntheticCandidate(params) {
      if (typeof runSyntheticCandidate !== 'function') fail('F0_CANDIDATE_BOUND_QA_NOT_PROVISIONED');
      return runSyntheticCandidate(params, { request, json });
    },
    async recoverSyntheticCandidate(params) {
      if (typeof recoverSyntheticCandidate !== 'function') fail('F0_RECOVERY_NOT_PROVISIONED');
      return recoverSyntheticCandidate(params, { request, json });
    },
    async cleanupSyntheticCandidate(params) {
      if (typeof cleanupSyntheticCandidate !== 'function') fail('F0_CLEANUP_NOT_PROVISIONED');
      return cleanupSyntheticCandidate(params, { request, json });
    },
    async removeFailedCandidate(params) {
      if (typeof removeFailedCandidate !== 'function') fail('F0_FAILED_CANDIDATE_CLEANUP_NOT_PROVISIONED');
      return removeFailedCandidate(params, { request, json });
    },
  };
}
