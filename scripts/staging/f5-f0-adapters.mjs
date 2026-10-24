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
const { chromium, webkit } = require('@playwright/test');

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


/** Score-family browser witness, evaluated inside the actual SCO iframe.
 * Reading a persisted lesson_location alone cannot prove visual restoration.
 * Unsupported/non-Score packages are deliberately inconclusive, not PASS.
 */
export function captureF5ScoreVisualState() {
  const slides = window.COURSE_DATA?.slides;
  // These selectors come from the unmodified Costa do Sol Score engine (R4),
  // not from a synthetic harness DOM. Keep the SCO's slide model read-only.
  const counterText = document.querySelector('#counterText[data-slide-counter="true"]')
    ?.textContent?.trim() ?? '';
  const counterMatch = /^([1-9]\d*)\s*\/\s*([1-9]\d*)$/.exec(counterText);
  const index = counterMatch ? Number(counterMatch[1]) - 1 : null;
  const total = counterMatch ? Number(counterMatch[2]) : null;
  const navigation = Array.from(document.querySelectorAll(
    '.score-sidebar-list button.score-nav-item'));
  const selected = navigation.filter(button => button.getAttribute('aria-current') === 'step');
  // The authored Score engine emits positional buttons, not data-slide/slideId.
  // An extra/missing button or multiple current buttons is inconclusive.
  const navIndex = selected.length === 1 && navigation.length === slides?.length
    ? navigation.indexOf(selected[0]) : null;
  const stage = document.querySelector('#airtrust-app .score-stage-scroll');
  const heading = stage?.querySelector('.score-title-block h1');
  const bounds = stage?.getBoundingClientRect();
  const title = Number.isSafeInteger(index) && Array.isArray(slides)
    ? slides[index]?.title : null;
  return {
    contract: 'F5_SCORE_RENDERED_DOM_V1', index, total, navIndex,
    stageVisible: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
    titleMatchesModel: typeof title === 'string' && title.trim().length > 0 &&
      heading?.textContent?.trim() === title.trim(),
    modelLength: Array.isArray(slides) ? slides.length : null,
  };
}

/** Bind rendered slide title + counter + active navigation to authored CMI. */
export function requireF5ScoreVisualState(visual, location, suspend, {
  previousIndex = null, previousLocation = null, previousSuspend = null,
} = {}) {
  const valid = visual?.contract === 'F5_SCORE_RENDERED_DOM_V1' &&
    Number.isSafeInteger(visual.index) && visual.index >= 0 &&
    Number.isSafeInteger(visual.total) && visual.total > 1 &&
    visual.index < visual.total && visual.modelLength === visual.total &&
    visual.navIndex === visual.index && visual.stageVisible === true &&
    visual.titleMatchesModel === true &&
    // The reviewed Score R4 engine writes its real 1-based page/total marker
    // on every Commit. Do not accept changed but unrelated CMI as slide proof.
    location === String(visual.index + 1) + '/' + String(visual.total) &&
    typeof suspend === 'string' && suspend.trim().length > 0 &&
    (previousIndex === null || (Number.isSafeInteger(previousIndex) &&
      visual.index === previousIndex + 1 &&
      location !== previousLocation && suspend !== previousSuspend));
  // SCORM bookmark encoding belongs to the authored SCO. Treat it as opaque;
  // prove navigation changed authored CMI and that the rendered slide survives
  // a fresh context, rather than inventing a private suspend_data schema.
  if (!valid) throw Error('F5_VISUAL_RESUME_WITNESS_INVALID');
  return { index: visual.index, total: visual.total };
}


/** Reject a fresh-context render that disagrees with the pre-close slide. */
export function requireF5ScoreResumeMatch(before, after) {
  if (!before || !after || !Number.isSafeInteger(before.index) ||
      before.index < 1 || before.index !== after.index ||
      before.total !== after.total || before.modelLength !== after.modelLength) {
    throw Error('F5_VISUAL_RESUME_WITNESS_INVALID');
  }
  return true;
}

async function waitForF5ScoreVisualState({ frame, page, location, suspend, previous = null }) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const visual = await frame.locator('body').evaluate(captureF5ScoreVisualState);
    try {
      requireF5ScoreVisualState(visual, location, suspend, previous
        ? { previousIndex: previous.index, previousLocation: previous.location,
            previousSuspend: previous.suspend } : {});
      if (previous?.rendered) requireF5ScoreResumeMatch(previous.rendered, visual);
      return visual;
    } catch {
      if (attempt === 29) fail('VISUAL_RESUME_WITNESS_INVALID');
      await page.waitForTimeout(200);
    }
  }
}

function checkedScope(plan, params) {
  const c = plan?.candidate, f = plan?.syntheticFixture;
  if (!c || !f || params.tenantId !== c.tenantId || params.courseId !== c.courseId ||
      (params.packageSha256 !== undefined && params.packageSha256 !== c.packageSha256) ||
      (params.enrollmentId !== undefined && params.enrollmentId !== f.enrollmentId) ||
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
  const expiresAt = Date.parse(f?.expiresAt ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) fail('RECEIPT_EXPIRED');
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

/**
 * Browser-serializable SCORM write sequence. Commit MUST follow all SetValue
 * calls; an early commit can return success while persisting stale CMI.
 */
export function commitIncompleteScormState({ is2004, marker, suspend, alreadyInitialized = false }) {
  const api = is2004 ? window.API_1484_11 : window.API;
  if (!api) throw Error('SCORM_API_UNAVAILABLE');
  const locationKey = is2004 ? 'cmi.location' : 'cmi.core.lesson_location';
  if (alreadyInitialized) {
    // The authored SCO has already initialized the API: GetValue succeeded
    // before this probe. Calling Initialize again violates the SCORM lifecycle.
    const get = is2004 ? api.GetValue : api.LMSGetValue;
    if (typeof get !== 'function' || get.call(api, locationKey) !== marker ||
        get.call(api, 'cmi.suspend_data') !== suspend) {
      throw Error('SCORM_AUTHORED_SESSION_NOT_INITIALIZED');
    }
  } else {
    const initialized = is2004 ? api.Initialize('') : api.LMSInitialize('');
    if (initialized !== 'true') throw Error('SCORM_INITIALIZE_REJECTED');
  }
  const set = (key, value) => is2004 ? api.SetValue(key, value) : api.LMSSetValue(key, value);
  const incompleteKey = is2004 ? 'cmi.completion_status' : 'cmi.core.lesson_status';
  const exitKey = is2004 ? 'cmi.exit' : 'cmi.core.exit';
  if (set(locationKey, marker) !== 'true' ||
      set('cmi.suspend_data', suspend) !== 'true' ||
      set(incompleteKey, 'incomplete') !== 'true' ||
      set(exitKey, 'suspend') !== 'true') throw Error('SCORM_INCOMPLETE_SET_REJECTED');
  const committed = is2004 ? api.Commit('') : api.LMSCommit('');
  if (committed !== 'true') throw Error('SCORM_INCOMPLETE_COMMIT_REJECTED');
  const get = is2004 ? api.GetValue : api.LMSGetValue;
  const actualSuspend = typeof get === 'function' ? get.call(api, 'cmi.suspend_data') : null;
  const actualMarker = typeof get === 'function' ? get.call(api, locationKey) : null;
  if (actualMarker !== marker || actualSuspend !== suspend) {
    throw Error('SCORM_INCOMPLETE_READBACK_MISMATCH');
  }
  return { marker: actualMarker, suspend: actualSuspend, apiVersion: is2004 ? '2004' : '1.2' };
}

/** Reject missing authored CMI; synthetic placeholders cannot certify resume. */
export function requireAuthoredF5State(location, suspend) {
  if (typeof location !== 'string' || location.trim().length === 0 ||
      typeof suspend !== 'string' || suspend.trim().length === 0) {
    fail('AUTHORED_STATE_NOT_OBSERVED');
  }
  return { marker: location, suspend };
}

/** Resume is driven by the authored SCO; never Initialize its API twice. */
/** A compliant SCO may throw GetValue until its own Initialize completes. */
export function hasAuthoredF5State(is2004) {
  const api = is2004 ? window.API_1484_11 : window.API;
  const get = is2004 ? api?.GetValue : api?.LMSGetValue;
  if (typeof get !== 'function') return false;
  try {
    const location = get.call(api, is2004 ? 'cmi.location' : 'cmi.core.lesson_location');
    const suspend = get.call(api, 'cmi.suspend_data');
    return typeof location === 'string' && location.trim().length > 0 &&
      typeof suspend === 'string' && suspend.trim().length > 0;
  } catch { return false; }
}

export function readInitializedF5ResumeState({ is2004 }) {
  const api = is2004 ? window.API_1484_11 : window.API;
  const get = is2004 ? api?.GetValue : api?.LMSGetValue;
  if (typeof get !== 'function') throw Error('SCORM_RESUME_API_UNAVAILABLE');
  const location = get.call(api, is2004 ? 'cmi.location' : 'cmi.core.lesson_location');
  const suspend = get.call(api, 'cmi.suspend_data');
  if (typeof location !== 'string' || !location.trim() ||
      typeof suspend !== 'string' || !suspend.trim()) {
    throw Error('SCORM_RESUME_AUTHORED_STATE_NOT_OBSERVED');
  }
  return { location, suspend };
}

/** A successful HTTP response is not proof of a scoped D1 Commit. */
export function requireF5CommitReceipt(envelope, params, expectedSuspendSha256, priorSessionCount = 0) {
  const receipt = envelope?.data;
  if (envelope?.success !== true ||
      receipt?.source !== 'F0_CANDIDATE_INCOMPLETE_COMMIT_V1' ||
      receipt?.packageSha256 !== params.packageSha256 ||
      receipt?.runId !== params.runId || receipt?.cycleId !== params.cycleId ||
      !HEX64.test(expectedSuspendSha256 ?? '') ||
      receipt?.suspendSha256 !== expectedSuspendSha256 ||
      !HEX64.test(receipt?.cmiSha256 ?? '') ||
      receipt?.completionWritten !== false || receipt?.scoreWritten !== false ||
      receipt?.certificateIssued !== false ||
      !Number.isSafeInteger(receipt?.sessionCount) ||
      receipt.sessionCount <= priorSessionCount) fail('COMMIT_RECEIPT_INVALID');
  return receipt.sessionCount;
}

/** Require the authenticated Worker/D1 witness for the exact Commit receipt. */
export function requireF5CommitReadbackCount(readback, committedCount, committedCmiSha256) {
  if (!Number.isSafeInteger(committedCount) ||
      !Number.isSafeInteger(readback?.sessionCount) ||
      readback.sessionCount < committedCount) fail('COMMIT_READBACK_SESSION_MISMATCH');
  // A strictly advancing session counter does not prove the CMI persisted.
  // Bind each Worker Commit/Finish receipt to the authenticated D1 digest.
  if (!HEX64.test(committedCmiSha256 ?? '') ||
      readback?.cmiSha256 !== committedCmiSha256) fail('COMMIT_READBACK_CMI_MISMATCH');
  return true;
}

/** Failure diagnostics must never log response bodies, tokens or learner state. */
export function safeF5HttpFailure(response) {
  const status = response?.status?.();
  const rawRequestId = response?.headers?.()?.['x-request-id'];
  return {
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    requestId: typeof rawRequestId === 'string' &&
      /^[A-Za-z0-9_-]{8,80}$/.test(rawRequestId) ? rawRequestId : null,
  };
}

async function browserExecution({ plan, params, request, env, browserType }) {
  const origin = String(env.F5_STAGING_API_ORIGIN || 'https://airtrust-api-staging.airtrust.workers.dev').replace(/\/$/, '');
  const token = env.SCORM_QA_ACCESS_TOKEN;
  if (!token || token.length <= 40) fail('STAGING_ADMIN_TOKEN_NOT_PROVISIONED');
  const path = `/api/lms/scorm/qa-f0/launch/${params.courseId}/${encodeURIComponent(params.packageId)}/${params.enrollmentId}`;
  const browser = await browserType.launch({ headless: true });
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

    // Wait for both values from the authored SCO. A timeout is a failed
    // probe, never permission to synthesize suspend_data or a slide marker.
    const authoredStateObserved = await page.waitForFunction(
      hasAuthoredF5State, is2004, { timeout: 15_000 },
    ).then(() => true, () => false);
    if (!authoredStateObserved) fail('AUTHORED_STATE_NOT_OBSERVED');

    const initialLocation = await page.evaluate(is2004 => {
      const api = is2004 ? window.API_1484_11 : window.API;
      if (!api) return null;
      const get = is2004 ? api.GetValue : api.LMSGetValue;
      const locationKey = is2004 ? 'cmi.location' : 'cmi.core.lesson_location';
      return typeof get === 'function' ? get.call(api, locationKey) : null;
    }, is2004);
    const initialSuspend = await page.evaluate(is2004 => {
      const api = is2004 ? window.API_1484_11 : window.API;
      if (!api) return null;
      const get = is2004 ? api.GetValue : api.LMSGetValue;
      return typeof get === 'function' ? get.call(api, 'cmi.suspend_data') : null;
    }, is2004);

    // Browser-first proof: do not commit a synthetic bookmark on the first page.
    // Advance with the SCO's own navigation so authored CMI and visible content move together.
    const initial = requireAuthoredF5State(initialLocation, initialSuspend);
    const initialRendered = await waitForF5ScoreVisualState({
      frame, page, location: initial.marker, suspend: initial.suspend,
    });
    const startingCursor = { index: initialRendered.index };
    const next = frame.locator('#next');
    if (!(await next.isVisible()) || !(await next.isEnabled())) fail('VISUAL_NAVIGATION_UNAVAILABLE');
    await next.click({ timeout: 15_000 });
    await page.waitForFunction(({ is2004, previousLocation, previousSuspend }) => {
      const api = is2004 ? window.API_1484_11 : window.API;
      const get = is2004 ? api?.GetValue : api?.LMSGetValue;
      if (typeof get !== 'function') return false;
      try {
        const location = get.call(api, is2004 ? 'cmi.location' : 'cmi.core.lesson_location');
        const suspend = get.call(api, 'cmi.suspend_data');
        return typeof location === 'string' && typeof suspend === 'string' &&
          (location !== previousLocation || suspend !== previousSuspend);
      } catch { return false; }
    }, { is2004, previousLocation: initial.marker, previousSuspend: initial.suspend },
    { timeout: 15_000 });
    const moved = await page.evaluate(is2004 => {
      const api = is2004 ? window.API_1484_11 : window.API;
      const get = is2004 ? api?.GetValue : api?.LMSGetValue;
      if (typeof get !== 'function') return null;
      return { location: get.call(api, is2004 ? 'cmi.location' : 'cmi.core.lesson_location'),
        suspend: get.call(api, 'cmi.suspend_data') };
    }, is2004);
    const { marker, suspend } = requireAuthoredF5State(moved?.location, moved?.suspend);
    const advancedRendered = await waitForF5ScoreVisualState({
      frame, page, location: marker, suspend,
      previous: { index: startingCursor.index, location: initial.marker,
        suspend: initial.suspend },
    });
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/lms/scorm/qa-f0/commit/') && response.request().method() === 'POST',
      { timeout: 30_000 });
    const first = await page.evaluate(commitIncompleteScormState, {
      is2004, marker, suspend, alreadyInitialized: true,
    });
    const firstCommit = await responsePromise;
    if (!firstCommit || !firstCommit.ok()) {
      console.error('[COMMIT_FAIL_DIAGNOSTIC]', safeF5HttpFailure(firstCommit));
      fail('WORKER_COMMIT_HTTP_FAILED');
    }
    const expectedSuspendSha256 = sha256(first.suspend);
    const firstCommitReceipt = await firstCommit.json();
    const firstSessionCount = requireF5CommitReceipt(firstCommitReceipt, params, expectedSuspendSha256);
    const firstReadback = await json(`/api/lms/cursos/${params.courseId}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-evidence/${params.enrollmentId}?sha256=${params.packageSha256}`, { method: 'GET', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET } });
    assertReadback(firstReadback, params, first, plan.releaseSha);
    requireF5CommitReadbackCount(firstReadback, firstSessionCount, firstCommitReceipt.data.cmiSha256);
    const finishPromise = page.waitForResponse(response =>
      response.url().includes('/api/lms/scorm/qa-f0/commit/') && response.request().method() === 'POST',
      { timeout: 30_000 });
    await page.evaluate(is2004 => {
      const api = is2004 ? window.API_1484_11 : window.API;
      const result = is2004 ? api.Terminate('') : api.LMSFinish('');
      if (result !== 'true') throw Error('SCORM_FINISH_REJECTED');
    }, is2004);
    const finishCommit = await finishPromise;
    if (!finishCommit || !finishCommit.ok()) {
      console.error('[FINISH_COMMIT_FAIL_DIAGNOSTIC]', safeF5HttpFailure(finishCommit));
      fail('WORKER_FINISH_COMMIT_HTTP_FAILED');
    }
    const finishCommitReceipt = await finishCommit.json();
    const finishSessionCount = requireF5CommitReceipt(finishCommitReceipt, params, expectedSuspendSha256, firstSessionCount);
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
    // The SCO owns Initialize on a fresh launch. Wait for its authored
    // resume state instead of invoking Initialize a second time.
    await resumedPage.waitForFunction(hasAuthoredF5State, is2004, { timeout: 15_000 });
    const resumed = await resumedPage.evaluate(readInitializedF5ResumeState, { is2004 });
    // A D1 bookmark can survive while the SCO visibly resets to page one.
    // Verify the rendered title, active menu selection and counter after relaunch.
    if (resumed.location !== first.marker || resumed.suspend !== first.suspend) {
      fail('SCORM_RESUME_STATE_MISMATCH');
    }
    await waitForF5ScoreVisualState({
      frame: resumedPage.frameLocator('#scorm-frame'), page: resumedPage,
      location: resumed.location, suspend: resumed.suspend,
      previous: { rendered: advancedRendered },
    });
    const final = await json(`/api/lms/cursos/${params.courseId}/scorm-package-versions/${encodeURIComponent(params.packageId)}/qa-evidence/${params.enrollmentId}?sha256=${params.packageSha256}`, { method: 'GET', headers: { 'X-Airtrust-F5-QA-Readback': env.SCORM_QA_READBACK_SECRET } });
    assertReadback(final, params, first, plan.releaseSha);
    requireF5CommitReadbackCount(final, finishSessionCount, finishCommitReceipt.data.cmiSha256);
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
  const failed = [];
  if (data?.source !== 'WORKER_D1_STAGING_READBACK') failed.push('source');
  if (Number(data?.empresaId ?? data?.tenantId) !== params.tenantId) failed.push('tenantId');
  if (Number(data?.cursoId ?? data?.courseId) !== params.courseId) failed.push('courseId');
  if (data?.packageId !== params.packageId) failed.push('packageId');
  if (data?.packageSha256 !== params.packageSha256) failed.push('packageSha256');
  if (data?.runtimeSha !== runtimeSha) failed.push('runtimeSha');
  if (data?.enrollmentId !== params.enrollmentId) failed.push('enrollmentId');
  if (data?.cycleId !== params.cycleId) failed.push('cycleId');
  if (data?.runId !== params.runId) failed.push('runId');
  if (data?.synthetic !== true) failed.push('synthetic');
  if (data?.servedPackageSha256 !== params.packageSha256) failed.push('servedPackageSha256');
  if (data?.committedPackageSha256 !== params.packageSha256) failed.push('committedPackageSha256');
  if (!HEX64.test(data?.cmiSha256 ?? '')) failed.push('cmiSha256_format');
  if (!HEX64.test(data?.suspendSha256 ?? '')) failed.push('suspendSha256_format');
  if (data?.suspendSha256 !== sha256(expected.suspend)) {
    failed.push('suspendSha256_mismatch');
  }
  if (!Number.isSafeInteger(data?.sessionCount)) failed.push('sessionCount_type');
  if ((data?.sessionCount ?? 0) < 1) failed.push('sessionCount_value');
  if (data?.qualificationHistoryCount !== 0) failed.push('qualificationHistoryCount');
  if (data?.certificateDocument !== null) failed.push('certificateDocument');
  if (data?.scormScoreRaw !== null) failed.push('scormScoreRaw');
  if (!['EM_ANDAMENTO', 'NAO_INICIADO'].includes(data?.completionStatus)) failed.push('completionStatus');
  if (expected.marker.length < 1) failed.push('expected_marker_empty');
  if (expected.suspend.length < 1) failed.push('expected_suspend_empty');

  if (failed.length > 0) {
    // Emit only fixed field names, never raw D1/CMI, learner scope or digests.
    console.error('[ASSERT_READBACK_FAILURES]', { failed });
    fail('D1_READBACK_SCOPE_OR_STATE_INVALID');
  }
  return data;
}


/**
 * Both browser engines must exercise the same candidate against the staging
 * Worker. Each invocation performs its own Commit, Finish, fresh-context
 * resume and authenticated D1 readback. One engine passing is insufficient.
 */
export async function runF5BrowserPair(runBrowser) {
  const results = [];
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const evidence = await runBrowser({ engine, browserType });
    if (evidence?.source !== 'WORKER_CANDIDATE_QA_EXECUTION' ||
        evidence?.resumeVerified !== true ||
        evidence?.locationPersisted !== true ||
        evidence?.suspendDataPersisted !== true) fail('BROWSER_' + engine.toUpperCase() + '_EVIDENCE_INVALID');
    results.push(evidence);
  }
  const [chromiumEvidence, webkitEvidence] = results;
  for (const key of [
    'source', 'candidateId', 'packageSha256', 'enrollmentId', 'cycleId', 'runId',
    'servedPackageSha256', 'committedPackageSha256', 'suspendSha256', 'runtimeVersion',
  ]) {
    if (chromiumEvidence[key] !== webkitEvidence[key]) fail('BROWSER_PAIR_SCOPE_MISMATCH');
  }
  if (!Number.isSafeInteger(chromiumEvidence.sessionCount) ||
      !Number.isSafeInteger(webkitEvidence.sessionCount) ||
      webkitEvidence.sessionCount <= chromiumEvidence.sessionCount) {
    fail('BROWSER_PAIR_READBACK_REGRESSION');
  }
  return { ...webkitEvidence, browserEngines: ['chromium', 'webkit'] };
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
      return runF5BrowserPair(({ browserType }) => browserExecution({ plan, params, request, env, browserType }));
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
