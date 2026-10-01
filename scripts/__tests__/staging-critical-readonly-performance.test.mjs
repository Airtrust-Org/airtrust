import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  percentile,
  summarizeSamples,
} from '../staging/qa-critical-readonly-performance.mjs';

test('percentile uses nearest-rank semantics for a small latency sample', () => {
  const values = [120, 80, 300, 150];
  assert.equal(percentile(values, 50), 120);
  assert.equal(percentile(values, 95), 300);
});

test('summarizeSamples reports request count, latency and payload bytes', () => {
  const summary = summarizeSamples([
    { elapsedMs: 80, bytes: 1000 },
    { elapsedMs: 120, bytes: 1200 },
    { elapsedMs: 300, bytes: 1100 },
  ]);
  assert.deepEqual(summary, {
    requests: 3,
    minMs: 80,
    p50Ms: 120,
    p95Ms: 300,
    maxMs: 300,
    avgBytes: 1100,
    maxBytes: 1200,
  });
});

test('official staging full smoke publishes the read-only performance baseline', () => {
  const workflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
  assert.match(workflow, /Authenticated read-only performance baseline/);
  assert.match(workflow, /qa-critical-readonly-performance\.mjs/);
  assert.match(workflow, /PERF_BASELINE\(_TOTAL\)\?/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
});
