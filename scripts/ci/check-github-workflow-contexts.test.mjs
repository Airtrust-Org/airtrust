import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectWorkflowText } from './check-github-workflow-contexts.mjs';

test('requires a positive timeout for every job in protected workflows', () => {
  const violations = inspectWorkflowText(
    'ci.yml',
    `name: CI
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`,
  );

  assert.deepEqual(violations, ['ci.yml jobs.build must define timeout-minutes']);
});

test('accepts protected workflow jobs with explicit positive timeouts', () => {
  const violations = inspectWorkflowText(
    'test.yml',
    `name: Tests
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - run: npm test
`,
  );

  assert.deepEqual(violations, []);
});

test('rejects continue-on-error in fail-closed validation workflows', () => {
  const violations = inspectWorkflowText(
    'pr-check.yml',
    `name: PR Check
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - run: npm run lint
        continue-on-error: true
`,
  );

  assert.deepEqual(violations, ['pr-check.yml:8 jobs.check cannot continue on error']);
});

test('allows non-critical reporting steps to remain best-effort', () => {
  const violations = inspectWorkflowText(
    'test.yml',
    `name: Tests
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: codecov/codecov-action@v5
        continue-on-error: true
`,
  );

  assert.deepEqual(violations, []);
});

test('keeps rejecting runner context inside job-level env', () => {
  const violations = inspectWorkflowText(
    'other.yml',
    `name: Other
jobs:
  check:
    runs-on: ubuntu-latest
    env:
      TEMP_DIR: \${{ runner.temp }}
    steps:
      - run: echo ok
`,
  );

  assert.deepEqual(violations, ['other.yml:6 jobs.check.env cannot use runner context']);
});


test('rejects untrusted PR title interpolated directly in multiline shell run', () => {
  const sample = [
    'jobs:',
    '  check:',
    '    timeout-minutes: 10',
    '    steps:',
    '      - name: unsafe',
    '        run: |',
    '          echo "${{ github.event.pull_request.title }}"',
  ].join('\n');
  const violations = inspectWorkflowText('pr-check.yml', sample);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /untrusted GitHub context inside run/);
});

test('permits untrusted PR metadata only through step env', () => {
  const sample = [
    'jobs:',
    '  check:',
    '    timeout-minutes: 10',
    '    steps:',
    '      - name: safe',
    '        env:',
    '          TITLE: ${{ github.event.pull_request.title }}',
    '        run: |',
    '          printf "%s\\n" "$TITLE"',
  ].join('\n');
  assert.deepEqual(inspectWorkflowText('pr-check.yml', sample), []);
});
