import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { F5_EXECUTOR_LIMITS, executeF5InactiveCandidate } from '../staging/f5-inactive-candidate-executor.mjs';
import { createF5WorkerAdapters, openF5PrivateZipSource } from '../staging/f5-worker-adapters.mjs';
import { runF5InactiveCandidateFromEnvironment } from '../staging/run-f5-inactive-candidate.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const token = 'x'.repeat(64);

async function withServer(handler, run) {
  const server = createServer((req, res) => handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ success: true, data }));
}

test('uses authenticated Worker multipart routes and tenant-scoped candidate listing', async () => {
  const calls = [];
  const archive = Buffer.from('bounded-private-zip-fixture');
  const asset = Buffer.from('<html>candidate</html>');
  const packageId = '223e4567-e89b-12d3-a456-426614174000';
  await withServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization,
        body: body.toString(), contentType: req.headers['content-type'] });
      if (req.url === '/api/lms/cursos/7301/scorm-upload/streamed/init') {
        json(res, { operationId: '123e4567-e89b-12d3-a456-426614174000' }, 201);
      } else if (req.url.endsWith('/parts/1')) json(res, { partNumber: 1 });
      else if (req.url.endsWith('/complete')) json(res, {
        packageId, packageSha256: sha(archive), status: 'VALIDATED', createdByOperation: true,
        scormVersion: '1.2',
        alreadyExisted: false, active: false, completionWritten: false, certificateIssued: false,
        zipBytes: archive.length, structural: { status: 'PASS' },
        completionManifest: { status: 'PASS' }, diagnostics: { status: 'PASS' },
        r2Prefix: `lms/scorm/9201/7301/_candidates/${packageId}/`, launchFile: 'index.html',
        r2Readback: { source: 'WORKER_R2_STREAMED_ZIP_READBACK', zipSha256: sha(archive),
          zipBytes: archive.length, rangeRequests: 2, etagStable: true,
          memberIntegrityVerified: true, launchAssetSha256: sha(asset) },
      }, 202);
      else if (req.url === '/api/lms/cursos/7301/scorm-package-versions') json(res, [{
        empresaId: 9201, cursoId: 7301,
        packageId, packageSha256: sha(archive), status: 'VALIDATED', active: false,
        scormVersion: '1.2',
        scormVersion: '1.2',
        r2Prefix: `lms/scorm/9201/7301/_candidates/${packageId}/`, launchFile: 'index.html',
      }]);
      else if (req.url === '/api/lms/assets/session') {
        res.writeHead(200, { 'content-type': 'application/json',
          'set-cookie': 'airtrust_lms_asset_token=opaque-short-lived; Path=/api/lms/; HttpOnly' });
        res.end(JSON.stringify({ success: true, data: { candidatePackageId: packageId,
          candidatePackageSha256: sha(archive), preview: true } }));
      } else if (req.url === `/api/lms/scorm/qa-assets/9201/7301/${packageId}/index.html`) {
        assert.equal(req.headers.cookie, 'airtrust_lms_asset_token=opaque-short-lived');
        res.writeHead(200, { 'content-type': 'text/html' }); res.end(asset);
      } else if (req.url.startsWith(`/api/lms/cursos/7301/scorm-package-versions/${packageId}/qa-evidence/8101`)) {
        assert.equal(req.headers['x-airtrust-f5-qa-readback'], 'r'.repeat(48));
        json(res, { source: 'WORKER_D1_STAGING_READBACK', empresaId: 9201, cursoId: 7301,
          packageId, packageSha256: sha(archive), runtimeSha: 'a'.repeat(40),
          enrollmentId: 8101, cycleId: 8201, runId: '123e4567-e89b-12d3-a456-426614174001',
          approvalReceiptSha256: 'c'.repeat(64), servedPackageSha256: null,
          committedPackageSha256: null, synthetic: true, completionStatus: 'NAO_INICIADO',
          cmiSha256: null, suspendSha256: null, sessionCount: 0,
          qualificationHistoryCount: 0, certificateDocument: null, scoreRaw: null });
      } else { res.writeHead(404); res.end(); }
    });
  }, async origin => {
    const adapters = createF5WorkerAdapters({ env: { SCORM_QA_ACCESS_TOKEN: token,
      SCORM_QA_READBACK_SECRET: 'r'.repeat(48), F5_STAGING_API_ORIGIN: origin,
      F5_STAGING_PAGES_ORIGIN: origin }, fetchImpl: fetch });
    await adapters.beginIntake({ tenantId: 9201, courseId: 7301, operationId: '123e4567-e89b-12d3-a456-426614174000',
      packageSha256: sha(archive), zipBytes: archive.length });
    await adapters.putIntakePart({ empresaId: 9201, cursoId: 7301, operationId: '123e4567-e89b-12d3-a456-426614174000',
      partNumber: 1, contentLength: archive.length, bytes: archive });
    const candidate = await adapters.completeIntake({ tenantId: 9201, courseId: 7301,
      operationId: '123e4567-e89b-12d3-a456-426614174000' });
    const row = await adapters.readCandidateD1({ tenantId: 9201, courseId: 7301,
      packageId, packageSha256: sha(archive) });
    const r2 = await adapters.readCandidateR2({ tenantId: 9201, courseId: 7301,
      packageId, packageSha256: sha(archive), launchFile: 'index.html', expectedSha256: sha(asset) });
    const qa = await adapters.readQaEvidence({ tenantId: 9201, courseId: 7301,
      packageId, packageSha256: sha(archive), enrollmentId: 8101 });
    assert.equal(candidate.packageId, packageId);
    assert.notEqual(candidate.packageId, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(row.tenantId, 9201);
    assert.equal(row.courseId, 7301);
    assert.equal(r2.assetSha256, sha(asset));
    assert.equal(r2.active, false);
    assert.equal(qa.tenantId, 9201);
    assert.equal(qa.courseId, 7301);
    assert.equal(qa.certificateDocument, null);
    assert.equal(qa.completionStatus, 'NAO_INICIADO');
    assert.ok(calls.every(call => call.auth === `Bearer ${token}` || call.url.includes('/qa-assets/')));
    assert.equal(calls.find(call => call.url.endsWith('/parts/1')).body, archive.toString());
    assert.equal(calls.find(call => call.url.endsWith('/parts/1')).contentType, 'application/octet-stream');
  });
});

test('converts empresaId/cursoId only after tenant checks and fails closed on mismatches', async () => {
  await withServer((req, res) => {
    if (req.url.endsWith('/scorm-package-versions')) json(res, [{ empresaId: 9201, cursoId: 7301,
      packageId: '223e4567-e89b-12d3-a456-426614174000',
      packageSha256: 'a'.repeat(64), status: 'VALIDATED', active: false, r2Prefix: 'prefix', launchFile: 'index.html' }]);
    else if (req.url.includes('/qa-evidence/')) json(res, { source: 'WORKER_D1_STAGING_READBACK',
      empresaId: 9999, cursoId: 7301 });
    else { res.writeHead(404); res.end(); }
  }, async origin => {
    const adapters = createF5WorkerAdapters({ env: { SCORM_QA_ACCESS_TOKEN: token,
      SCORM_QA_READBACK_SECRET: 'r'.repeat(48), F5_STAGING_API_ORIGIN: origin } });
    await assert.rejects(adapters.readQaEvidence({ tenantId: 9201, courseId: 7301,
      packageId: '223e4567-e89b-12d3-a456-426614174000', packageSha256: 'a'.repeat(64), enrollmentId: 8101 }),
    /QA_READBACK_TENANT_COURSE_MISMATCH/);
  });
});

test('requires a real F0 receipt and execution adapter; preview and client assertions cannot pass', async () => {
  const adapters = createF5WorkerAdapters({ env: { SCORM_QA_ACCESS_TOKEN: token } });
  await assert.rejects(adapters.verifyF0Receipts({}), /F0_RECEIPT_VERIFIER_NOT_PROVISIONED/);
  await assert.rejects(adapters.runSyntheticCandidate({}), /F0_CANDIDATE_BOUND_QA_NOT_PROVISIONED/);
  await assert.rejects(adapters.recoverSyntheticCandidate({}), /F0_RECOVERY_NOT_PROVISIONED/);
});

test('checks full Worker SHA and exact Pages short SHA provenance independently', async () => {
  const releaseSha = 'a'.repeat(40);
  await withServer((req, res) => {
    if (req.url === '/api/version') json(res, { environment: 'staging', sourceSha: releaseSha });
    else if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<meta name="build-version" content="staging-2026-10-23-${releaseSha.slice(0, 7)}">`);
    } else { res.writeHead(404); res.end(); }
  }, async origin => {
    const adapters = createF5WorkerAdapters({ env: { F5_STAGING_API_ORIGIN: origin,
      F5_STAGING_PAGES_ORIGIN: origin, F5_RELEASE_SHA: releaseSha, GITHUB_SHA: 'b'.repeat(40) } });
    assert.deepEqual(await adapters.readRuntimeProvenance(), { workerSha: releaseSha,
      pagesSha: releaseSha.slice(0, 7), harnessSha: 'b'.repeat(40) });
    const wrong = createF5WorkerAdapters({ env: { F5_STAGING_API_ORIGIN: origin,
      F5_STAGING_PAGES_ORIGIN: origin, F5_RELEASE_SHA: 'c'.repeat(40), GITHUB_SHA: 'b'.repeat(40) } });
    await assert.rejects(wrong.readRuntimeProvenance(), /WORKER_PROVENANCE_INVALID/);
  });
});

test('runner refuses to start when the private F0 adapter/source bundle is not provisioned', async () => {
  await assert.rejects(runF5InactiveCandidateFromEnvironment({}),
    /PRIVATE_PLAN_SOURCE_OR_PINNED_F0_ADAPTER_NOT_PROVISIONED/);
  await assert.rejects(runF5InactiveCandidateFromEnvironment({
    F5_EXECUTOR_PLAN_PATH: '/private/plan.json', F5_PRIVATE_ZIP_PATH: '/private/package.zip',
    F5_F0_ADAPTER_MODULE: '/private/f0-adapter.mjs', F5_F0_ADAPTER_SHA256: 'a'.repeat(64),
  }), /F0_ADAPTER_FILE_UNAVAILABLE/);
});

test('opens the private ZIP by bounded ranges without buffering the archive', async () => {
  const source = await openF5PrivateZipSource(new URL('./fixtures/f5-small-private-source.fixture', import.meta.url));
  try {
    assert.equal(source.size, Buffer.byteLength('fixture-range-read-verification-123\n'));
    const range = await source.read(3, 7);
    assert.equal(Buffer.from(range).toString(), 'ture-ra');
  } finally { await source.close(); }
});

test('runs the executor end to end through real Worker adapters against an isolated fixture server', async () => {
  const zip = Buffer.from('isolated-one-candidate-zip-fixture');
  const launch = Buffer.from('<html>fixture launch</html>');
  const packageSha256 = sha(zip), launchSha256 = sha(launch);
  const packageId = '323e4567-e89b-12d3-a456-426614174000';
  const operationId = '123e4567-e89b-12d3-a456-426614174000';
  const releaseSha = 'a'.repeat(40), harnessSha = 'b'.repeat(40);
  let qaReads = 0;
  const serverCalls = [];
  await withServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      serverCalls.push(`${req.method} ${req.url}`);
      if (req.url === '/api/lms/cursos/7301/scorm-upload/streamed/init') json(res, { started: true }, 201);
      else if (req.url.endsWith('/parts/1')) json(res, { accepted: true });
      else if (req.url.endsWith('/complete')) json(res, {
        packageId, packageSha256, status: 'VALIDATED', createdByOperation: true,
        scormVersion: '1.2',
        alreadyExisted: false, active: false, completionWritten: false, certificateIssued: false,
        zipBytes: zip.length, structural: { status: 'PASS' },
        completionManifest: { status: 'PASS' }, diagnostics: { status: 'PASS' },
        r2Prefix: `lms/scorm/9201/7301/_candidates/${packageId}/`, launchFile: 'index.html',
        r2Readback: { source: 'WORKER_R2_STREAMED_ZIP_READBACK', zipSha256: packageSha256,
          zipBytes: zip.length, rangeRequests: 1, etagStable: true,
          memberIntegrityVerified: true, launchAssetSha256: launchSha256 },
      }, 202);
      else if (req.url.endsWith('/scorm-package-versions')) json(res, [{ empresaId: 9201, cursoId: 7301,
        packageId, packageSha256,
        status: 'VALIDATED', active: false,
        scormVersion: '1.2',
        r2Prefix: `lms/scorm/9201/7301/_candidates/${packageId}/`, launchFile: 'index.html' }]);
      else if (req.url === '/api/lms/assets/session') {
        res.writeHead(200, { 'content-type': 'application/json',
          'set-cookie': 'airtrust_lms_asset_token=fixture-token; Path=/api/lms/; HttpOnly' });
        res.end(JSON.stringify({ success: true, data: { preview: true } }));
      } else if (req.url.endsWith(`/scorm/qa-assets/9201/7301/${packageId}/index.html`)) {
        res.writeHead(200); res.end(launch);
      } else if (req.url.includes('/qa-evidence/8101')) {
        qaReads++;
        json(res, { source: 'WORKER_D1_STAGING_READBACK', empresaId: 9201, cursoId: 7301,
          packageId, packageSha256, runtimeSha: releaseSha, enrollmentId: 8101, cycleId: 8201,
          runId: '123e4567-e89b-12d3-a456-426614174001', approvalReceiptSha256: 'c'.repeat(64),
          servedPackageSha256: qaReads === 1 ? null : packageSha256,
          committedPackageSha256: qaReads === 1 ? null : packageSha256, synthetic: true,
          completionStatus: 'EM_ANDAMENTO', cmiSha256: qaReads === 1 ? null : '1'.repeat(64),
          suspendSha256: qaReads === 1 ? null : '2'.repeat(64), sessionCount: qaReads === 1 ? 0 : 1,
          qualificationHistoryCount: 0, certificateDocument: null, scormScoreRaw: null });
      } else { res.writeHead(404); res.end(); }
    });
  }, async origin => {
    const base = createF5WorkerAdapters({ env: { SCORM_QA_ACCESS_TOKEN: token,
      SCORM_QA_READBACK_SECRET: 'r'.repeat(48), F5_STAGING_API_ORIGIN: origin,
      F5_STAGING_PAGES_ORIGIN: origin }, provisionF0Binding: async () => ({ source: 'fixture' }) });
    const plan = { schemaVersion: 1, scope: 'ONE_INACTIVE_CANDIDATE', releaseSha, harnessSha,
      mutex: F5_EXECUTOR_LIMITS.mutex,
      candidate: { environment: 'staging', tenantId: 9201, courseId: 7301,
        packageSha256, zipBytes: zip.length, operationId },
      syntheticFixture: { enrollmentId: 8101, cycleId: 8201,
        runId: '123e4567-e89b-12d3-a456-426614174001', approvalReceiptSha256: 'c'.repeat(64),
        provisioningReceiptSha256: 'd'.repeat(64), recoveryReceiptSha256: 'e'.repeat(64),
        cleanupContractSha256: 'f'.repeat(64),
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
    const adapters = { ...base, verifyAuthorization: async () => true,
      readRuntimeProvenance: async () => ({ workerSha: releaseSha, pagesSha: releaseSha.slice(0, 7), harnessSha }),
      verifyF0Receipts: async () => true,
      runSyntheticCandidate: async () => ({ source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: packageId,
        packageSha256, enrollmentId: 8101, cycleId: 8201, runId: plan.syntheticFixture.runId,
        servedPackageSha256: packageSha256, committedPackageSha256: packageSha256,
        cmiSha256: '1'.repeat(64), suspendSha256: '2'.repeat(64), sessionCount: 1,
        completionStatus: 'EM_ANDAMENTO', qualificationHistoryCount: 0, certificateDocument: null,
        runtimeVersion: '1.2', locationPersisted: true,
        suspendDataPersisted: true, resumeVerified: true,
        browserEngines: ['chromium', 'webkit'],
        assessmentAttempted: false, assessmentApproved: false, externalAssessmentApproved: false,
        certificateIssued: false }),
      cleanupSyntheticCandidate: async () => ({ verified: true, syntheticFixtureCleaned: true,
        candidatePreservedInactive: true, receiptSha256: '9'.repeat(64) }),
    };
    const source = { size: zip.length, read: async (offset, length) => zip.subarray(offset, offset + length) };
    const result = await executeF5InactiveCandidate({ plan, source, adapters });
    assert.equal(result.status, 'INACTIVE_CANDIDATE_VERIFIED');
    assert.equal(result.candidate.active, false);
    assert.equal(result.candidate.packageId, packageId);
    assert.equal(result.certificateIssued, false);
    assert.equal(qaReads, 2);
    assert.ok(serverCalls.some(call => call.endsWith('/complete')));
    assert.ok(serverCalls.some(call => call.includes('/qa-evidence/8101')));
  });
});

test('Worker HTTP failure never reads or includes sensitive response bodies', async () => {
  let bodyReads = 0;
  const adapters = createF5WorkerAdapters({
    env: { SCORM_QA_ACCESS_TOKEN: token, F5_STAGING_API_ORIGIN: 'https://staging.invalid' },
    fetchImpl: async () => ({
      ok: false, status: 500,
      async text() { bodyReads++; return 'Bearer SECRET learnerId=8101'; },
    }),
  });
  await assert.rejects(
    adapters.beginIntake({
      tenantId: 9201, courseId: 7301,
      operationId: '123e4567-e89b-12d3-a456-426614174000',
      packageSha256: 'a'.repeat(64), zipBytes: 40644,
    }),
    error => error.message === 'F5_WORKER_ADAPTER_WORKER_HTTP_500'
  );
  assert.equal(bodyReads, 0, 'response body must not be read');
});

test('HTTP 500 completion recovery accepts only the exact operation and inactive candidate', async () => {
  const operationId = '123e4567-e89b-12d3-a456-426614174000';
  const packageSha256 = 'a'.repeat(64);
  const packageId = '223e4567-e89b-12d3-a456-426614174000';
  const valid = { source: 'WORKER_F5_INTAKE_STATUS', operationId,
    state: 'CANDIDATE_PRESENT', candidate: {
      packageId, packageSha256, active: false,
      createdByOperation: true, alreadyExisted: false } };
  let status = valid;
  await withServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.headers.authorization, 'Bearer ' + token);
    assert.ok(req.url.includes(operationId + '/status?sha256=' + packageSha256));
    json(res, status);
  }, async origin => {
    const adapters = createF5WorkerAdapters({
      env: { SCORM_QA_ACCESS_TOKEN: token, F5_STAGING_API_ORIGIN: origin },
    });
    const params = { tenantId: 9201, courseId: 7301, operationId, packageSha256 };
    assert.equal((await adapters.resolveAmbiguousIntake(params)).verified, true);
    for (const bad of [
      { ...valid, operationId: '223e4567-e89b-12d3-a456-426614174001' },
      { ...valid, operationId: undefined },
      { ...valid, state: 'INTAKE_PRESENT', packageSha256: 'b'.repeat(64) },
      { ...valid, state: 'CLEAN', operationId: undefined },
      { ...valid, candidate: { ...valid.candidate, active: true } },
      { ...valid, candidate: { ...valid.candidate, active: undefined } },
      { ...valid, candidate: { ...valid.candidate, createdByOperation: false } },
    ]) {
      status = bad;
      await assert.rejects(adapters.resolveAmbiguousIntake(params),
        /AMBIGUOUS_(INTAKE_READBACK_INVALID|CANDIDATE_OWNERSHIP_UNPROVEN)/);
    }
    status = { source: valid.source, operationId, state: 'INTAKE_PRESENT', packageSha256 };
    assert.equal((await adapters.resolveAmbiguousIntake(params)).state, 'INTAKE_PRESENT');
    status = { source: valid.source, operationId, state: 'CLEAN' };
    assert.equal((await adapters.resolveAmbiguousIntake(params)).state, 'CLEAN');
  });
});
