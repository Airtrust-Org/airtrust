import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectBlockedSignatures,
  findNewBlockedSignatures,
} from '../ci/audit-critical-delta.mjs';

function report(vulnerabilities) {
  return { auditReportVersion: 2, vulnerabilities };
}

test('collects high and critical advisory identities and ignores lower severities', () => {
  const signatures = collectBlockedSignatures(
    report({
      alpha: {
        severity: 'critical',
        range: '<2.0.0',
        via: [{ source: 1234, severity: 'critical', range: '<2.0.0' }],
      },
      beta: {
        severity: 'high',
        range: '*',
        via: [{ source: 5678, severity: 'high', range: '*' }],
      },
      gamma: {
        severity: 'moderate',
        range: '*',
        via: [{ source: 9012, severity: 'moderate', range: '*' }],
      },
    }),
    'root',
  );

  assert.deepEqual([...signatures].sort(), [
    'root|critical|alpha|1234|<2.0.0',
    'root|high|beta|5678|*',
  ]);
});

test('uses an aggregate signature for high/critical package-reference vulnerabilities', () => {
  const signatures = collectBlockedSignatures(
    report({
      transitive: {
        severity: 'high',
        range: '<=1.0.0',
        via: ['upstream-package'],
      },
    }),
    'worker',
  );

  assert.deepEqual([...signatures], ['worker|high|transitive|aggregate-high|<=1.0.0']);
});

test('returns only blocked signatures introduced by the head snapshot', () => {
  const base = new Set(['root|high|alpha|1|<2', 'worker|critical|beta|2|<3']);
  const head = new Set([
    'root|high|alpha|1|<2',
    'worker|critical|beta|2|<3',
    'root|high|gamma|3|<4',
  ]);

  assert.deepEqual(findNewBlockedSignatures(base, head), ['root|high|gamma|3|<4']);
});

test('does not fail a neutral delta because of the historical baseline', () => {
  const baseline = new Set(['root|high|legacy|99|*']);
  assert.deepEqual(findNewBlockedSignatures(baseline, new Set(baseline)), []);
});


test('resolves inherited blocked advisories instead of signing aggregate package ranges', () => {
  const signatures = collectBlockedSignatures(
    report({
      wrapper: { severity: 'high', range: '>=4.0.0', via: ['leaf'] },
      leaf: {
        severity: 'high',
        range: '<2.0.0',
        via: [{ source: 4242, severity: 'high', range: '<2.0.0' }],
      },
    }),
    'worker',
  );

  assert.deepEqual([...signatures].sort(), [
    'worker|high|leaf|4242|<2.0.0',
    'worker|high|wrapper|4242|<2.0.0',
  ]);
});

test('does not flag an inherited advisory as new when only the aggregate affected range changes', () => {
  const base = collectBlockedSignatures(
    report({
      wrapper: { severity: 'high', range: '4.0.0 - 4.9.0', via: ['leaf'] },
      leaf: {
        severity: 'high',
        range: '<2.0.0',
        via: [{ source: 4242, severity: 'high', range: '<2.0.0' }],
      },
    }),
    'worker',
  );
  const head = collectBlockedSignatures(
    report({
      wrapper: { severity: 'high', range: '>=4.0.0', via: ['leaf'] },
      leaf: {
        severity: 'high',
        range: '<2.0.0',
        via: [{ source: 4242, severity: 'high', range: '<2.0.0' }],
      },
    }),
    'worker',
  );

  assert.deepEqual(findNewBlockedSignatures(base, head), []);
});

test('still flags a genuinely new inherited high advisory', () => {
  const base = collectBlockedSignatures(
    report({
      wrapper: { severity: 'high', range: '>=4.0.0', via: ['leaf'] },
      leaf: {
        severity: 'high',
        range: '<2.0.0',
        via: [{ source: 4242, severity: 'high', range: '<2.0.0' }],
      },
    }),
    'worker',
  );
  const head = collectBlockedSignatures(
    report({
      wrapper: { severity: 'high', range: '>=4.0.0', via: ['leaf'] },
      leaf: {
        severity: 'high',
        range: '<3.0.0',
        via: [
          { source: 4242, severity: 'high', range: '<2.0.0' },
          { source: 9001, severity: 'high', range: '<3.0.0' },
        ],
      },
    }),
    'worker',
  );

  assert.deepEqual(findNewBlockedSignatures(base, head), [
    'worker|high|leaf|9001|<3.0.0',
    'worker|high|wrapper|9001|<3.0.0',
  ]);
});

test('fails closed with aggregate signature when inherited advisory chain cannot be resolved', () => {
  const signatures = collectBlockedSignatures(
    report({
      wrapper: { severity: 'high', range: '>=4.0.0', via: ['missing-package'] },
    }),
    'worker',
  );

  assert.deepEqual([...signatures], ['worker|high|wrapper|aggregate-high|>=4.0.0']);
});

test('handles cyclic inherited package references without recursion failure', () => {
  const signatures = collectBlockedSignatures(
    report({
      alpha: { severity: 'high', range: '*', via: ['beta'] },
      beta: { severity: 'high', range: '*', via: ['alpha'] },
    }),
    'worker',
  );

  assert.deepEqual([...signatures].sort(), [
    'worker|high|alpha|aggregate-high|*',
    'worker|high|beta|aggregate-high|*',
  ]);
});
