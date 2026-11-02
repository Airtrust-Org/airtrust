import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { captureF5ScoreVisualState, chooseF5ScoreNavigation, requireF5ScoreVisualState, requireF5ScoreResumeMatch, commitIncompleteScormState, createF0Adapters, hasAuthoredF5State, requireAuthoredF5State, requireF5CommitReceipt, requireF5CommitReadbackCount, readInitializedF5ResumeState, runF5BrowserPair, safeF5HttpFailure } from '../staging/f5-f0-adapters.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};

function planFor() {
  const plan = {
    releaseSha: 'a'.repeat(40),
    candidate: { tenantId: 9201, courseId: 15, packageSha256: 'b'.repeat(64) },
    syntheticFixture: {
      enrollmentId: 8101, cycleId: 8201,
      runId: '123e4567-e89b-12d3-a456-426614174001',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
  };
  const scope = {
    tenantId: plan.candidate.tenantId, courseId: plan.candidate.courseId,
    enrollmentId: plan.syntheticFixture.enrollmentId, cycleId: plan.syntheticFixture.cycleId,
    runId: plan.syntheticFixture.runId, releaseSha: plan.releaseSha,
    expiresAt: plan.syntheticFixture.expiresAt,
    packageSha256: plan.candidate.packageSha256,
  };
  const docs = {
    approval: { ...scope, activation: false, assessmentApproval: false, certification: false },
    provisioning: { ...scope, synthetic: true },
    recovery: { ...scope, action: 'RESTORE_SYNTHETIC_PREIMAGE' },
    cleanupContract: { ...scope, deleteRealLearnerData: false },
  };
  plan.syntheticFixture.receiptDocuments = docs;
  for (const [name, doc] of Object.entries(docs)) {
    const field = name === 'cleanupContract' ? 'cleanupContractSha256' : `${name}ReceiptSha256`;
    plan.syntheticFixture[field] = digest(canonical(doc));
  }
  return plan;
}

test('verifies the four scoped F0 receipt documents by canonical digest', async () => {
  const plan = planFor();
  const adapters = await createF0Adapters({ plan, env: {} });
  assert.equal(await adapters.verifyF0Receipts(plan), true);
  plan.syntheticFixture.receiptDocuments.recovery.runId = '123e4567-e89b-12d3-a456-426614174099';
  await assert.rejects(adapters.verifyF0Receipts(plan), /RECOVERY_RECEIPT_MISMATCH/);
});

test('rejects plan substitution and policy-changing F0 receipts', async () => {
  const plan = planFor();
  const adapters = await createF0Adapters({ plan, env: {} });
  await assert.rejects(adapters.verifyF0Receipts({ ...plan }), /PLAN_IDENTITY_CHANGED/);
  plan.syntheticFixture.receiptDocuments.approval.activation = true;
  plan.syntheticFixture.approvalReceiptSha256 = digest(canonical(plan.syntheticFixture.receiptDocuments.approval));
  await assert.rejects(adapters.verifyF0Receipts(plan), /RECEIPT_POLICY_INVALID/);
});

test('F5 physical candidate QA chains sequential Chromium and WebKit on the same enrollment', async () => {
  const engines = [];
  const expected = {
    source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: 'candidate-1',
    packageSha256: 'a'.repeat(64), servedPackageSha256: 'a'.repeat(64),
    committedPackageSha256: 'a'.repeat(64), enrollmentId: 17, cycleId: 19,
    runId: '123e4567-e89b-12d3-a456-426614174001', suspendSha256: 'b'.repeat(64),
    runtimeVersion: '1.2', resumeVerified: true, locationPersisted: true,
    suspendDataPersisted: true,
  };
  const result = await runF5BrowserPair(async ({ engine, browserType }) => {
    assert.equal(typeof browserType.launch, 'function');
    engines.push(engine);
    return { ...expected, sessionCount: engines.length,
      suspendSha256: engine === 'chromium' ? 'b'.repeat(64) : 'c'.repeat(64),
      initialResumeWitnessSha256: engine === 'chromium' ? '1'.repeat(64) : '2'.repeat(64),
      committedResumeWitnessSha256: engine === 'chromium' ? '2'.repeat(64) : '3'.repeat(64),
      navigationMode: 'FORWARD',
    };
  });
  assert.deepEqual(engines, ['chromium', 'webkit']);
  assert.deepEqual(result.browserEngines, ['chromium', 'webkit']);
  assert.equal(result.sessionCount, 2);
  assert.equal(result.suspendSha256, 'c'.repeat(64),
    'WebKit final suspend must differ from Chromium after sequential Next');
});

test('F5 candidate QA fails closed if WebKit fails or diverges from Chromium readback', async () => {
  const baseline = {
    source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: 'candidate-1',
    packageSha256: 'a'.repeat(64), servedPackageSha256: 'a'.repeat(64),
    committedPackageSha256: 'a'.repeat(64), enrollmentId: 17, cycleId: 19,
    runId: '123e4567-e89b-12d3-a456-426614174001',
    suspendSha256: 'b'.repeat(64), runtimeVersion: '1.2',
    resumeVerified: true, locationPersisted: true, suspendDataPersisted: true,
    sessionCount: 1,
  };
  await assert.rejects(runF5BrowserPair(async ({ engine }) => {
    if (engine === 'webkit') throw Error('WEBKIT_LAUNCH_FAILED');
    return baseline;
  }), /WEBKIT_LAUNCH_FAILED/);
  await assert.rejects(runF5BrowserPair(async ({ engine }) => ({
    ...baseline, packageSha256: engine === 'webkit' ? 'c'.repeat(64) : 'a'.repeat(64),
    sessionCount: engine === 'webkit' ? 2 : 1,
  })), /BROWSER_PAIR_SCOPE_MISMATCH/);
  await assert.rejects(runF5BrowserPair(async ({ engine }) => ({
    ...baseline, sessionCount: engine === 'webkit' ? 0 : 1,
  })), /BROWSER_PAIR_READBACK_REGRESSION/);
  // A second browser with no new persisted session is not a second proof.
  await assert.rejects(runF5BrowserPair(async () => ({
    ...baseline, sessionCount: 2,
  })), /BROWSER_PAIR_READBACK_REGRESSION/);
});

test('F5 browser pair rejects a WebKit resume disconnected from Chromium committed CMI', async () => {
  const scope = {
    source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: 'candidate-1',
    packageSha256: 'a'.repeat(64), servedPackageSha256: 'a'.repeat(64),
    committedPackageSha256: 'a'.repeat(64), enrollmentId: 17, cycleId: 19,
    runId: '123e4567-e89b-12d3-a456-426614174001',
    runtimeVersion: '1.2', resumeVerified: true, locationPersisted: true,
    suspendDataPersisted: true, navigationMode: 'FORWARD',
  };
  const browser = async ({ engine }) => engine === 'chromium'
    ? { ...scope, sessionCount: 1, suspendSha256: 'b'.repeat(64),
        initialResumeWitnessSha256: '1'.repeat(64),
        committedResumeWitnessSha256: '2'.repeat(64) }
    : { ...scope, sessionCount: 2, suspendSha256: 'c'.repeat(64),
        initialResumeWitnessSha256: '9'.repeat(64),
        committedResumeWitnessSha256: '3'.repeat(64) };
  await assert.rejects(runF5BrowserPair(browser),
    /BROWSER_PAIR_RESUME_CHAIN_MISMATCH/);
  await assert.rejects(runF5BrowserPair(async ({ engine }) => {
    const state = await browser({ engine });
    return engine === 'webkit'
      ? { ...state, initialResumeWitnessSha256: '2'.repeat(64),
          suspendSha256: 'b'.repeat(64) } : state;
  }), /BROWSER_PAIR_RESUME_CHAIN_MISMATCH/,
  'WebKit replay of Chromium suspend digest is not independent progress');
  await assert.rejects(runF5BrowserPair(async ({ engine }) => {
    const state = await browser({ engine });
    return engine === 'webkit'
      ? { ...state, initialResumeWitnessSha256: '2'.repeat(64),
          committedResumeWitnessSha256: '2'.repeat(64) } : state;
  }), /BROWSER_PAIR_RESUME_CHAIN_MISMATCH/,
  'WebKit cannot claim success without its own new rendered bookmark');
});

test('F5 browser pair permits only authenticated resume-only evidence at locked authored slide', async () => {
  const scope = {
    source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: 'candidate-1',
    packageSha256: 'a'.repeat(64), servedPackageSha256: 'a'.repeat(64),
    committedPackageSha256: 'a'.repeat(64), enrollmentId: 17, cycleId: 19,
    runId: '123e4567-e89b-12d3-a456-426614174001',
    runtimeVersion: '1.2', resumeVerified: true, locationPersisted: true,
    suspendDataPersisted: true,
  };
  const chromium = { ...scope, sessionCount: 1, suspendSha256: 'b'.repeat(64),
    initialResumeWitnessSha256: '1'.repeat(64),
    committedResumeWitnessSha256: '2'.repeat(64), navigationMode: 'FORWARD' };
  const webkit = { ...scope, sessionCount: 2, suspendSha256: 'b'.repeat(64),
    initialResumeWitnessSha256: '2'.repeat(64),
    committedResumeWitnessSha256: '2'.repeat(64),
    navigationMode: 'RESUME_ONLY_AUTHORED_INTERACTION',
    interactionRequiredWitness: true, witnessedResumeIndex: 1 };
  const run = async ({ engine }) => engine === 'chromium' ? chromium : webkit;
  const paired = await runF5BrowserPair(run);
  assert.equal(paired.navigationMode, 'RESUME_ONLY_AUTHORED_INTERACTION');
  for (const changes of [
    { interactionRequiredWitness: false },
    { witnessedResumeIndex: 0 },
    { witnessedResumeIndex: null },
    { navigationMode: 'FORWARD' },
    { committedResumeWitnessSha256: '3'.repeat(64) },
    { suspendSha256: 'c'.repeat(64) },
    { initialResumeWitnessSha256: '9'.repeat(64) },
    { sessionCount: 1 },
  ]) {
    await assert.rejects(runF5BrowserPair(async ({ engine }) =>
      engine === 'chromium' ? chromium : { ...webkit, ...changes }),
    /BROWSER_PAIR_(RESUME_CHAIN_MISMATCH|READBACK_REGRESSION)/);
  }
  await assert.rejects(runF5BrowserPair(async ({ engine }) =>
    engine === 'chromium' ? { ...chromium,
      navigationMode: 'RESUME_ONLY_AUTHORED_INTERACTION' } : webkit),
  /BROWSER_PAIR_RESUME_CHAIN_MISMATCH/);
});

test('F5 browser writes all CMI values before Commit for SCORM 1.2 and 2004', () => {
  const originalWindow = globalThis.window;
  try {
    for (const is2004 of [false, true]) {
      const events = [];
      const location = is2004 ? 'cmi.location' : 'cmi.core.lesson_location';
      const status = is2004 ? 'cmi.completion_status' : 'cmi.core.lesson_status';
      const exit = is2004 ? 'cmi.exit' : 'cmi.core.exit';
      const initialize = () => { events.push('initialize'); return 'true'; };
      const values = new Map();
      const setValue = (key, value) => {
        events.push(`set:${key}`); assert.ok(value); values.set(key, value); return 'true';
      };
      const getValue = key => values.get(key) ?? '';
      const commit = () => { events.push('commit'); return 'true'; };
      const api = is2004
        ? { Initialize: initialize, SetValue: setValue, GetValue: getValue, Commit: commit }
        : { LMSInitialize: initialize, LMSSetValue: setValue, LMSGetValue: getValue, LMSCommit: commit };
      globalThis.window = is2004 ? { API_1484_11: api } : { API: api };
      const args = { is2004, marker: 'F0:run:checkpoint', suspend: '{"checkpoint":1}' };
      const result = commitIncompleteScormState(args);
      assert.equal(result.apiVersion, is2004 ? '2004' : '1.2');
      assert.deepEqual(events, ['initialize', `set:${location}`, 'set:cmi.suspend_data',
        `set:${status}`, `set:${exit}`, 'commit']);

      const rejected = [];
      const rejectingApi = is2004
        ? { ...api, SetValue: (key) => { rejected.push(`set:${key}`); return 'false'; },
            Commit: () => { rejected.push('commit'); return 'true'; } }
        : { ...api, LMSSetValue: (key) => { rejected.push(`set:${key}`); return 'false'; },
            LMSCommit: () => { rejected.push('commit'); return 'true'; } };
      globalThis.window = is2004 ? { API_1484_11: rejectingApi } : { API: rejectingApi };
      assert.throws(() => commitIncompleteScormState(args), /SCORM_INCOMPLETE_SET_REJECTED/);
      assert.equal(rejected.includes('commit'), false, 'failed SetValue must never trigger Commit');
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('F5 HTTP diagnostics expose only status and validated request id, never response body', () => {
  const response = {
    status: () => 409,
    headers: () => ({ 'x-request-id': 'req-12345678' }),
    text: () => { throw Error('BODY_MUST_NOT_BE_READ'); },
  };
  assert.deepEqual(safeF5HttpFailure(response), { status: 409, requestId: 'req-12345678' });
  assert.deepEqual(safeF5HttpFailure({ ...response,
    headers: () => ({ 'x-request-id': 'Bearer secret token with PII' }),
  }), { status: 409, requestId: null });
  assert.deepEqual(safeF5HttpFailure(null), { status: null, requestId: null });
});

test('F5 rejects absent authored state rather than fabricating a suspend marker', () => {
  for (const [location, suspend] of [['', '{}'], ['slide-1', ''], [null, '{}'],
    ['slide-1', null], ['  ', '{"a":1}']]) {
    assert.throws(() => requireAuthoredF5State(location, suspend),
      /F5_F0_ADAPTER_AUTHORED_STATE_NOT_OBSERVED/);
  }
  assert.deepEqual(requireAuthoredF5State('authored-slide-1', '{"authored":true}'),
    { marker: 'authored-slide-1', suspend: '{"authored":true}' });
});

test('F5 Commit rejects CMI getters that cannot prove the persisted authored state', () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { API: {
      LMSInitialize: () => 'true', LMSSetValue: () => 'true', LMSCommit: () => 'true',
      LMSGetValue: () => '',
    } };
    assert.throws(() => commitIncompleteScormState({
      is2004: false, marker: 'authored-slide-1', suspend: '{"authored":true}',
    }), /SCORM_INCOMPLETE_READBACK_MISMATCH/);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('F5 readback diagnostics do not log CMI, enrollment scope or raw Worker payloads', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../staging/f5-f0-adapters.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.error\('\[RESUME_STATE_MISMATCH_DIAGNOSTIC\]', \{ resumed, first/);
  assert.doesNotMatch(source, /console\.error\('\[ASSERT_READBACK_FAILURES\]', \{[\s\S]*?\bdata,\s*expected:/);
  assert.doesNotMatch(source, /checkpoint: 'tripulacao-1', resume: true/);
  assert.match(source, /if \(!authoredStateObserved\) fail\('AUTHORED_STATE_NOT_OBSERVED'\)/);
});

test('F5 requires scoped Commit and Finish receipts with strictly advancing D1 sessions', () => {
  const expectedSuspendSha256 = digest('{"authored":true}');
  const params = {
    packageSha256: 'a'.repeat(64), runId: '123e4567-e89b-12d3-a456-426614174001',
    cycleId: 8201,
  };
  const receipt = sessionCount => ({ success: true, data: {
    source: 'F0_CANDIDATE_INCOMPLETE_COMMIT_V1', ...params,
    suspendSha256: expectedSuspendSha256, cmiSha256: 'c'.repeat(64),
    completionWritten: false, scoreWritten: false, certificateIssued: false,
    sessionCount,
  } });
  assert.equal(requireF5CommitReceipt(receipt(1), params, expectedSuspendSha256), 1);
  assert.equal(requireF5CommitReceipt(receipt(2), params, expectedSuspendSha256, 1), 2);
  assert.equal(requireF5CommitReadbackCount({
    sessionCount: 2, cmiSha256: 'c'.repeat(64),
  }, 2, 'c'.repeat(64)), true);
  // HTTP success and an advancing D1 counter are insufficient when the
  // Worker receipt and the authenticated D1 CMI digests disagree.
  assert.throws(() => requireF5CommitReadbackCount({
    sessionCount: 3, cmiSha256: 'd'.repeat(64),
  }, 2, 'c'.repeat(64)), /COMMIT_READBACK_CMI_MISMATCH/);
  assert.throws(() => requireF5CommitReadbackCount({
    sessionCount: 3, cmiSha256: 'c'.repeat(64),
  }, 2, undefined), /COMMIT_READBACK_CMI_MISMATCH/);
  for (const bad of [
    { ...receipt(2), success: false },
    { ...receipt(2), data: { ...receipt(2).data, packageSha256: 'b'.repeat(64) } },
    { ...receipt(2), data: { ...receipt(2).data, cycleId: 8202 } },
    { ...receipt(2), data: { ...receipt(2).data, runId: 'wrong-run' } },
    { ...receipt(2), data: { ...receipt(2).data, scoreWritten: true } },
    { ...receipt(2), data: { ...receipt(2).data, completionWritten: true } },
    { ...receipt(2), data: { ...receipt(2).data, certificateIssued: true } },
    { ...receipt(2), data: { ...receipt(2).data, source: 'UNTRUSTED' } },
    { ...receipt(2), data: { ...receipt(2).data, suspendSha256: 'd'.repeat(64) } },
    { ...receipt(2), data: { ...receipt(2).data, suspendSha256: undefined } },
    { ...receipt(2), data: { ...receipt(2).data, cmiSha256: undefined } },
    receipt(1), // Replayed Finish receipt after the first Commit.
  ]) assert.throws(() => requireF5CommitReceipt(bad, params, expectedSuspendSha256, 1), /COMMIT_RECEIPT_INVALID/);
  assert.throws(() => requireF5CommitReceipt(receipt(2), params, undefined, 1),
    /COMMIT_RECEIPT_INVALID/);
  assert.throws(() => requireF5CommitReceipt(receipt(2), params, 'd'.repeat(64), 1),
    /COMMIT_RECEIPT_INVALID/);
  assert.throws(() => requireF5CommitReadbackCount({ sessionCount: 1, cmiSha256: 'c'.repeat(64) }, 2, 'c'.repeat(64)),
    /COMMIT_READBACK_SESSION_MISMATCH/);
  // A SCO may legitimately auto-commit again before the readback.
  assert.equal(requireF5CommitReadbackCount({ sessionCount: 3, cmiSha256: 'c'.repeat(64) }, 2, 'c'.repeat(64)), true);
});

test('F5 does not initialize an authored SCO twice before synthetic Commit (SCORM 1.2/2004)', () => {
  const original = globalThis.window;
  try {
    for (const is2004 of [false, true]) {
      const marker = 'authored-slide-1', suspend = '{"authored":true}';
      const loc = is2004 ? 'cmi.location' : 'cmi.core.lesson_location';
      const state = new Map([[loc, marker], ['cmi.suspend_data', suspend]]);
      const events = [];
      const api = {
        [is2004 ? 'Initialize' : 'LMSInitialize']: () => {
          events.push('duplicate-initialize'); return 'false';
        },
        [is2004 ? 'SetValue' : 'LMSSetValue']: (key, value) => {
          events.push('set:' + key); state.set(key, value); return 'true';
        },
        [is2004 ? 'GetValue' : 'LMSGetValue']: key => state.get(key) ?? '',
        [is2004 ? 'Commit' : 'LMSCommit']: () => { events.push('commit'); return 'true'; },
      };
      globalThis.window = is2004 ? { API_1484_11: api } : { API: api };
      const result = commitIncompleteScormState({ is2004, marker, suspend, alreadyInitialized: true });
      assert.equal(result.marker, marker);
      assert.equal(events.includes('duplicate-initialize'), false);
      assert.equal(events.at(-1), 'commit');
    }
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});


test('F5 resume observes authored CMI without a second Initialize (SCORM 1.2/2004)', () => {
  const original = globalThis.window;
  try {
    for (const is2004 of [false, true]) {
      let initializedAgain = false;
      const locationKey = is2004 ? 'cmi.location' : 'cmi.core.lesson_location';
      const api = {
        [is2004 ? 'Initialize' : 'LMSInitialize']: () => {
          initializedAgain = true; return 'false';
        },
        [is2004 ? 'GetValue' : 'LMSGetValue']: key => ({
          [locationKey]: 'authored-slide-1', 'cmi.suspend_data': '{"authored":true}',
        })[key] ?? '',
      };
      globalThis.window = is2004 ? { API_1484_11: api } : { API: api };
      assert.deepEqual(readInitializedF5ResumeState({ is2004 }), {
        location: 'authored-slide-1', suspend: '{"authored":true}',
      });
      assert.equal(initializedAgain, false);
      const badApi = {
        ...api,
        [is2004 ? 'GetValue' : 'LMSGetValue']: () => '',
      };
      globalThis.window = is2004 ? { API_1484_11: badApi } : { API: badApi };
      assert.throws(() => readInitializedF5ResumeState({ is2004 }),
        /SCORM_RESUME_AUTHORED_STATE_NOT_OBSERVED/);
    }
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});


test('F5 authored-state polling retries a GetValue that throws until SCO Initialize', () => {
  const original = globalThis.window;
  try {
    for (const is2004 of [false, true]) {
      const locationKey = is2004 ? 'cmi.location' : 'cmi.core.lesson_location';
      let ready = false;
      const api = {
        [is2004 ? 'GetValue' : 'LMSGetValue']: key => {
          if (!ready) throw Error('SCORM_NOT_INITIALIZED');
          return key === locationKey ? 'authored-slide-1' :
            key === 'cmi.suspend_data' ? '{"authored":true}' : '';
        },
      };
      globalThis.window = is2004 ? { API_1484_11: api } : { API: api };
      assert.equal(hasAuthoredF5State(is2004), false);
      ready = true;
      assert.equal(hasAuthoredF5State(is2004), true);
      globalThis.window = {};
      assert.equal(hasAuthoredF5State(is2004), false);
    }
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test('rejects expired but otherwise digest-valid F0 receipt documents', async () => {
  const plan = planFor();
  const f = plan.syntheticFixture;
  f.expiresAt = new Date(Date.now() - 60_000).toISOString();
  for (const [name, doc] of Object.entries(f.receiptDocuments)) {
    doc.expiresAt = f.expiresAt;
    const field = name === 'cleanupContract' ? 'cleanupContractSha256' : `${name}ReceiptSha256`;
    f[field] = digest(canonical(doc));
  }
  const adapters = await createF0Adapters({ plan, env: {} });
  await assert.rejects(adapters.verifyF0Receipts(plan), /RECEIPT_EXPIRED/);
});


// The F5 runner may not call a SCO resumed merely because CMI is present:
// real Score navigation must advance and re-render the same authored bookmark.
const f5Visual = (index = 1) => ({
  contract: 'F5_SCORE_RENDERED_DOM_V1', index, total: 5, navIndex: index,
  stageVisible: true, titleMatchesModel: true, modelLength: 5,
});
const f5Suspend = index => 'opaque-authored-suspend-' + index;

test('Score F5 guard requires authored CMI to change on actual Next navigation', () => {
  assert.deepEqual(requireF5ScoreVisualState(f5Visual(), '2/5', f5Suspend(1),
    { previousIndex: 0, previousLocation: '1/5',
      previousSuspend: f5Suspend(0) }), { index: 1, total: 5 });
  assert.throws(() => requireF5ScoreVisualState(f5Visual(), '2/5', f5Suspend(0),
    { previousIndex: 0, previousLocation: '1/5',
      previousSuspend: f5Suspend(0) }), /VISUAL_RESUME_WITNESS_INVALID/,
  'new page marker with stale suspend_data cannot be accepted');
  assert.throws(() => requireF5ScoreVisualState(f5Visual(), '3/5', f5Suspend(1)),
    /VISUAL_RESUME_WITNESS_INVALID/,
  'cursor must match the real Score engine page/total bookmark');

  assert.throws(() => requireF5ScoreVisualState(f5Visual(0), '1/5', f5Suspend(0),
    { previousIndex: 0, previousLocation: '1/5',
      previousSuspend: f5Suspend(0) }), /VISUAL_RESUME_WITNESS_INVALID/);
  assert.throws(() => requireF5ScoreVisualState(f5Visual(), '1/5', f5Suspend(0),
    { previousIndex: 0, previousLocation: '1/5',
      previousSuspend: f5Suspend(0) }), /VISUAL_RESUME_WITNESS_INVALID/);
});

test('Score F5 holds a locked authored slide for real Commit/Finish without regress', () => {
  const locked = { ...f5Visual(1), interactionRequired: true };
  const args = { nextVisible: true, nextEnabled: false,
    prevEnabled: true, initialRendered: locked };
  assert.equal(chooseF5ScoreNavigation(args), 0,
    'authored interaction must not be bypassed by regressing the Worker location');
  assert.equal(chooseF5ScoreNavigation({ ...args, nextEnabled: true }), 1);
  for (const changes of [
    { nextVisible: false }, { prevEnabled: false },
    { initialRendered: { ...locked, interactionRequired: false } },
    { initialRendered: { ...locked, index: 0 } },
    { initialRendered: { ...locked, index: null } },
  ]) assert.throws(() => chooseF5ScoreNavigation({ ...args, ...changes }),
    /F5_VISUAL_NAVIGATION_UNAVAILABLE/);
  assert.deepEqual(requireF5ScoreVisualState(locked, '2/5', f5Suspend(1)),
    { index: 1, total: 5 });
  assert.equal(requireF5ScoreResumeMatch(locked, locked), true);
  assert.throws(() => requireF5ScoreVisualState(f5Visual(0), '1/5', f5Suspend(0),
    { previousIndex: 1, previousLocation: '2/5', previousSuspend: f5Suspend(1) }),
    /F5_VISUAL_RESUME_WITNESS_INVALID/,
  'regression from slide 2 to 1 is never proof of an advanced state');
  assert.throws(() => requireF5ScoreResumeMatch(f5Visual(0), f5Visual(0)),
    /F5_VISUAL_RESUME_WITNESS_INVALID/);
  assert.throws(() => requireF5ScoreResumeMatch(locked, f5Visual(0)),
    /F5_VISUAL_RESUME_WITNESS_INVALID/);
});

test('Score F5 cross-context guard rejects persisted bookmark with first slide rendered', () => {
  assert.equal(requireF5ScoreResumeMatch(f5Visual(), f5Visual()), true);
  assert.throws(() => requireF5ScoreResumeMatch(f5Visual(), f5Visual(0)),
    /VISUAL_RESUME_WITNESS_INVALID/);
  assert.throws(() => requireF5ScoreResumeMatch(f5Visual(), { ...f5Visual(), total: 6 }),
    /VISUAL_RESUME_WITNESS_INVALID/);
  assert.throws(() => requireF5ScoreResumeMatch(f5Visual(0), f5Visual(0)),
    /VISUAL_RESUME_WITNESS_INVALID/);
});

test('Score F5 guard requires correct navigation, visible stage, model title and total', () => {
  for (const modified of [{ navIndex: 0 }, { titleMatchesModel: false },
    { stageVisible: false }, { modelLength: 4 }, { total: 0 },
    { contract: 'NOT_SCORE' }, { index: null }]) {
    assert.throws(() => requireF5ScoreVisualState({ ...f5Visual(), ...modified },
      '2/5', f5Suspend(1)), /VISUAL_RESUME_WITNESS_INVALID/);
  }
  for (const invalid of ['', '  ', null, undefined]) {
    assert.throws(() => requireF5ScoreVisualState(f5Visual(), '2/5', invalid),
      /VISUAL_RESUME_WITNESS_INVALID/);
  }
});

test('Score F5 DOM witness reads visible course title, counter and active slide', () => {
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  const stage = { querySelector: () => ({ textContent: 'Segurança' }),
    getBoundingClientRect: () => ({ width: 400, height: 270 }) };
  const nav = Array.from({ length: 5 }, (_, i) => ({
    getAttribute: name => name === 'aria-current' ? (i === 1 ? 'step' : 'false') : null,
  }));
  globalThis.window = { COURSE_DATA: { slides: [
    { title: 'Início' }, { title: 'Segurança' }, { title: 'Encerramento' },
    { title: 'Revisão' }, { title: 'Fim' }] } };
  globalThis.document = {
    querySelector: selector => ({
      '#counterText[data-slide-counter="true"]': { textContent: '2 / 5' },
      '#airtrust-app .score-stage-scroll': stage,
    })[selector] ?? null,
    querySelectorAll: selector => selector === '.score-sidebar-list button.score-nav-item'
      ? nav : [],
  };
  try {
    assert.deepEqual(requireF5ScoreVisualState(captureF5ScoreVisualState(),
      '2/5', f5Suspend(1)), { index: 1, total: 5 });
    stage.querySelector = () => ({ textContent: 'Início' });
    assert.throws(() => requireF5ScoreVisualState(captureF5ScoreVisualState(),
      '2/5', f5Suspend(1)), /VISUAL_RESUME_WITNESS_INVALID/);
    stage.querySelector = () => ({ textContent: 'Segurança' });
    nav[0].getAttribute = name => name === 'aria-current' ? 'step' : null;
    assert.throws(() => requireF5ScoreVisualState(captureF5ScoreVisualState(),
      '2/5', f5Suspend(1)), /VISUAL_RESUME_WITNESS_INVALID/,
    'two current sidebar buttons must not yield a synthetic cursor');
    nav[0].getAttribute = name => name === 'aria-current' ? 'false' : null;
    const fullNav = globalThis.document.querySelectorAll;
    globalThis.document.querySelectorAll = selector => fullNav(selector).slice(0, 4);
    assert.throws(() => requireF5ScoreVisualState(captureF5ScoreVisualState(),
      '2/5', f5Suspend(1)), /VISUAL_RESUME_WITNESS_INVALID/,
    'missing real navigation buttons must fail closed');
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; }
});
