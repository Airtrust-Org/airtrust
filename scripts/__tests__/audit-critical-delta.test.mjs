import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectCriticalSignatures,
  findNewCriticalSignatures,
} from '../ci/audit-critical-delta.mjs';

function report(vulnerabilities) {
  return { auditReportVersion: 2, vulnerabilities };
}

test('collects critical advisory identities and ignores lower severities', () => {
  const signatures = collectCriticalSignatures(
    report({
      alpha: {
        severity: 'critical',
        range: '<2.0.0',
        via: [
          {
            source: 1234,
            title: 'critical issue',
            severity: 'critical',
            range: '<2.0.0',
          },
        ],
      },
      beta: {
        severity: 'high',
        range: '*',
        via: [{ source: 5678, severity: 'high', range: '*' }],
      },
    }),
    'root',
  );

  assert.deepEqual([...signatures], ['root|alpha|1234|<2.0.0']);
});

test('uses an aggregate signature for package-reference criticals', () => {
  const signatures = collectCriticalSignatures(
    report({
      transitive: {
        severity: 'critical',
        range: '<=1.0.0',
        via: ['upstream-package'],
      },
    }),
    'worker',
  );

  assert.deepEqual([...signatures], ['worker|transitive|aggregate-critical|<=1.0.0']);
});

test('returns only critical signatures introduced by the head snapshot', () => {
  const base = new Set(['root|alpha|1|<2', 'worker|beta|2|<3']);
  const head = new Set([
    'root|alpha|1|<2',
    'worker|beta|2|<3',
    'root|gamma|3|<4',
  ]);

  assert.deepEqual(findNewCriticalSignatures(base, head), ['root|gamma|3|<4']);
});

test('does not fail a neutral delta because of the historical baseline', () => {
  const baseline = new Set(['root|legacy|99|*']);
  assert.deepEqual(findNewCriticalSignatures(baseline, new Set(baseline)), []);
});
