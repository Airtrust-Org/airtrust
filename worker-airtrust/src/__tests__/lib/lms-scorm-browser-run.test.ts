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
