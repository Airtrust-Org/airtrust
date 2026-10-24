import { describe, expect, it } from 'vitest';

import { analyzeTrace, classifyScormBrowserError, runScormBrowserConformance, scormBrowserFailureCode } from '../../lib/lms/lms-scorm-browser-run';

const startedAt = '2026-08-22T00:00:00.000Z';
const lifecycle = [
  { method: 'LMSInitialize' },
  { method: 'LMSSetValue', key: 'cmi.core.lesson_status', value: 'incomplete' },
  { method: 'LMSCommit' },
  { method: 'LMSFinish' },
];

describe('SCORM Browser Run failure reporting', () => {
  it('classifies a browser connection failure without exporting the raw error', () => {
    expect(classifyScormBrowserError(new Error('WebSocket disconnected from internal worker endpoint'))).toBe('BROWSER_CONNECTION');
  });
  it('classifies quota and access errors as stable categories', () => {
    expect(classifyScormBrowserError(new Error('429 Too many requests'))).toBe('BROWSER_QUOTA');
    expect(classifyScormBrowserError(new Error('403 Forbidden'))).toBe('BROWSER_ACCESS');
  });
  it('does not echo sensitive or unknown exception messages', () => {
    expect(classifyScormBrowserError(new Error('sensitive@example.invalid token=secret'))).toBe('BROWSER_OTHER');
  });
});

describe('SCORM Browser Rendering staging infrastructure failure boundaries', () => {
  const fixture = {
    browserBinding: {},
    candidateSha256: 'a'.repeat(64),
    launchFile: 'index.html',
    assets: [{ path: 'index.html', data: new TextEncoder().encode('<html><body>QA</body></html>') }],
  };
  it('retries one recoverable browser connection launch and never persists raw exceptions', async () => {
    let launchCount = 0;
    const secret = 'authorization=Bearer sensitive-personal-token@example.com';
    const runtime = await runScormBrowserConformance({
      ...fixture,
      launchBrowser: async () => {
        launchCount++;
        throw new Error('WebSocket disconnected ' + secret);
      },
    });
    expect(launchCount).toBe(2);
    expect(runtime).toMatchObject({
      status: 'ERROR',
      failureStage: 'BROWSER_LAUNCH',
      failureCategory: 'BROWSER_CONNECTION',
      failureCode: 'GENERIC_ERROR',
      errors: ['SCORM_BROWSER_INFRASTRUCTURE_ERROR'],
    });
    expect(JSON.stringify(runtime)).not.toContain(secret);
    expect(JSON.stringify(runtime)).not.toContain('sensitive-personal-token');
  });

  it.each(['403 Forbidden', '429 Too many requests'])(
    'never retries access/quota failures: %s',
    async message => {
      let launchCount = 0;
      const runtime = await runScormBrowserConformance({
        ...fixture,
        launchBrowser: async () => { launchCount++; throw new Error(message); },
      });
      expect(launchCount).toBe(1);
      expect(runtime.status).toBe('ERROR');
      expect(runtime.failureCategory).toMatch(/^BROWSER_(ACCESS|QUOTA)$/);
      expect(runtime.errors).toEqual(['SCORM_BROWSER_INFRASTRUCTURE_ERROR']);
    },
  );

  it('keeps exception names and codes on a finite allowlist', () => {
    expect(scormBrowserFailureCode(Object.assign(new Error('token=bad'), { code: 'ECONNRESET' }))).toBe('ECONNRESET');
    expect(scormBrowserFailureCode(Object.assign(new Error('token=bad'), { code: 'secret-embedded-code' }))).toBe('GENERIC_ERROR');
    expect(scormBrowserFailureCode({ name: 'UnexpectedPersonalName', code: 'secret-embedded-code' })).toBe('UNKNOWN_ERROR');
    expect(scormBrowserFailureCode(new TypeError('some private URL'))).toBe('TYPE_ERROR');
  });
});

describe('SCORM Browser Run trace analysis', () => {
  it('accepts lifecycle with incomplete as a runtime PASS, without claiming completion', () => {
    const result = analyzeTrace('sha-a', startedAt, lifecycle, { 'cmi.core.lesson_status': 'incomplete' }, true, true, '0');
    expect(result).toMatchObject({ status: 'PASS', completionReached: false, lessonStatus: 'incomplete', commitObserved: true, finishObserved: true });
  });

  // Runtime conformance is independent of course completion. A progressive/
  // suspend session — Initialize, exit=suspend, Commit, then a real
  // LMSFinish once the runner has given the package's own unload lifecycle
  // a chance to run (see runScormBrowserConformance's two-phase capture) —
  // is a fully valid SCORM 1.2 communication session, not an incomplete run.
  it('case 1: progressive/suspend session with exit=suspend is runtime PASS, completionReached false', () => {
    const progressiveLifecycle = [
      { method: 'LMSInitialize' },
      { method: 'LMSSetValue', key: 'cmi.core.lesson_status', value: 'incomplete' },
      { method: 'LMSSetValue', key: 'cmi.core.exit', value: 'suspend' },
      { method: 'LMSCommit' },
      { method: 'LMSFinish' },
    ];
    const values = { 'cmi.core.lesson_status': 'incomplete', 'cmi.core.exit': 'suspend' };
    const result = analyzeTrace('sha-a', startedAt, progressiveLifecycle, values, true, true, '0');
    expect(result).toMatchObject({ status: 'PASS', completionReached: false, lessonStatus: 'incomplete', commitObserved: true, finishObserved: true });
    expect(result.errors).toEqual([]);
  });

  it('case 2: completed course (lesson_status=passed) is runtime PASS, completionReached true', () => {
    const completedLifecycle = [
      { method: 'LMSInitialize' },
      { method: 'LMSSetValue', key: 'cmi.core.lesson_status', value: 'passed' },
      { method: 'LMSCommit' },
      { method: 'LMSFinish' },
    ];
    const result = analyzeTrace('sha-a', startedAt, completedLifecycle, { 'cmi.core.lesson_status': 'passed' }, true, true, '0');
    expect(result).toMatchObject({ status: 'PASS', completionReached: true, lessonStatus: 'passed', commitObserved: true, finishObserved: true });
  });

  it('case 3: session ended without ever calling LMSFinish is runtime FAIL with SCORM_SESSION_NOT_TERMINATED', () => {
    const unterminatedLifecycle = [
      { method: 'LMSInitialize' },
      { method: 'LMSSetValue', key: 'cmi.core.exit', value: 'suspend' },
      { method: 'LMSCommit' },
    ];
    const result = analyzeTrace('sha-a', startedAt, unterminatedLifecycle, { 'cmi.core.exit': 'suspend' }, true, false, '0');
    expect(result.status).toBe('FAIL');
    expect(result.finishObserved).toBe(false);
    expect(result.errors.some((error) => error.startsWith('SCORM_SESSION_NOT_TERMINATED'))).toBe(true);
    // This must never be reported as a completion/coursework failure.
    expect(result.errors.some((error) => /completion/i.test(error))).toBe(false);
  });

  it.each([
    ['Initialize', lifecycle.slice(1), false, true],
    ['Commit', lifecycle.filter((item) => item.method !== 'LMSCommit'), true, true],
    ['Finish', lifecycle.slice(0, -1), true, false],
  ])('fails when %s is absent', (_name, trace, initialized, finished) => {
    expect(analyzeTrace('sha-a', startedAt, trace, {}, initialized, finished, '0').status).toBe('FAIL');
  });

  it('redacts authored SCORM suspend_data and interaction values from published runtime traces', () => {
    const confidential = '{"answers":[1,2,3],"employee":"synthetic"}';
    const trace = [
      { method: 'LMSInitialize' },
      { method: 'LMSSetValue', key: 'cmi.suspend_data', value: confidential },
      { method: 'LMSCommit' },
      { method: 'LMSFinish' },
    ];
    const result = analyzeTrace('sha-a', startedAt, trace,
      { 'cmi.core.lesson_status': 'incomplete' }, true, true, '0');
    expect(result.status).toBe('PASS');
    expect(JSON.stringify(result.trace)).not.toContain('answers');
    expect(JSON.stringify(result.trace)).not.toContain('employee');
    expect(result.trace[1]).toMatchObject({
      method: 'LMSSetValue', key: 'cmi.suspend_data', value: '[redacted]',
    });
  });

  it('fails a mutation after finish', () => {
    expect(analyzeTrace('sha-a', startedAt, [...lifecycle, { method: 'LMSCommit' }], {}, true, true, '0').status).toBe('FAIL');
  });
});
