import { describe, expect, it } from 'vitest';

import { analyzeTrace } from '../../lib/lms/lms-scorm-browser-run';

const startedAt = '2026-08-22T00:00:00.000Z';
const lifecycle = [
  { method: 'LMSInitialize' },
  { method: 'LMSSetValue', key: 'cmi.core.lesson_status', value: 'incomplete' },
  { method: 'LMSCommit' },
  { method: 'LMSFinish' },
];

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

  it('fails a mutation after finish', () => {
    expect(analyzeTrace('sha-a', startedAt, [...lifecycle, { method: 'LMSCommit' }], {}, true, true, '0').status).toBe('FAIL');
  });
});
