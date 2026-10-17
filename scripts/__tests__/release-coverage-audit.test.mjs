import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyReleaseComparison,
  pagesEntryPrefix,
  pagesParity,
} from '../ops/release-coverage-audit.mjs';

test('published source ancestry is proven only by GitHub compare', () => {
  assert.equal(classifyReleaseComparison('ahead'), 'CODE_IN_PRODUCTION');
  assert.equal(classifyReleaseComparison('identical'), 'CODE_IN_PRODUCTION');
  assert.equal(classifyReleaseComparison('behind'), 'MERGED_NOT_DEPLOYED');
  assert.equal(classifyReleaseComparison('diverged'), 'PROVENANCE_UNVERIFIED');
  assert.equal(classifyReleaseComparison(undefined), 'PROVENANCE_UNVERIFIED');
});
test('published Pages entry must carry the Worker SHA prefix', () => {
  const html = '<script type="module" crossorigin src="/assets/index-2026-10-10T184452Z-59b395a-ByNmN_sY.js"></script>';
  const sha = '59b395a2dd9e43c27e86cd63a462053bade79b46';
  assert.equal(pagesEntryPrefix(html), '59b395a');
  assert.equal(pagesEntryPrefix('<script src="/assets/index.js"></script>'), null);
  assert.equal(pagesParity('59b395a', sha), 'PREFIX_MATCH');
  assert.equal(pagesParity('0000000', sha), 'MISMATCH');
  assert.equal(pagesParity(null, sha), 'UNVERIFIED');
});

test('Actions relative script entrypoint is actually invoked', () => {
  const output = execFileSync('node', ['scripts/ops/release-coverage-audit.mjs', '--help'], { encoding: 'utf8' });
  assert.match(output, /Read-only merge-vs-production SHA ancestry/);
});

test('release audit runs after real deployment and from explicit manual/scheduled entrypoints', () => {
  const yaml = readFileSync('.github/workflows/release-coverage-audit.yml', 'utf8');
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /schedule:/);
  assert.match(yaml, /workflows: \['Deploy AirTrust'\]/);
  assert.match(yaml, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(yaml, /permissions:\s+contents: read\s+pull-requests: read/);
});


test('audit scopes remain explicit, bounded and opt-in for historical scan', async () => {
  const { auditScopeOptions } = await import('../ops/release-coverage-audit.mjs');
  assert.deepEqual(auditScopeOptions('recent'), { scope: 'recent', windowDays: 14, maxPrs: 80, maxPages: 6 });
  assert.deepEqual(auditScopeOptions('historical'), { scope: 'historical', windowDays: 365, maxPrs: 300, maxPages: 25 });
  assert.throws(() => auditScopeOptions('unlimited'), /INVALID_RELEASE_AUDIT_SCOPE/);
});

test('merged pull pagination reports incomplete inventory when the hard cap is reached', async () => {
  const { recentMergedPulls } = await import('../ops/release-coverage-audit.mjs');
  const updated = '2026-10-11T21:00:00Z';
  const page = Array.from({ length: 100 }, (_, i) => ({
    number: i + 1, merged_at: updated, updated_at: updated, merge_commit_sha: 'a'.repeat(40),
    base: { ref: 'main' },
  }));
  const capped = await recentMergedPulls(Date.parse('2026-10-10'), {
    maxPrs: 5, maxPages: 2, fetchPage: async () => page,
  });
  assert.equal(capped.prs.length, 5);
  assert.equal(capped.truncated, true);
  assert.equal(capped.limitReason, 'MAX_PRS');
  assert.equal(capped.pagesScanned, 1);

  const exhausted = await recentMergedPulls(Date.parse('2026-10-10'), {
    maxPrs: 200, maxPages: 1, fetchPage: async () => page,
  });
  assert.equal(exhausted.truncated, true);
  assert.equal(exhausted.limitReason, 'MAX_SCAN_PAGES');

  const complete = await recentMergedPulls(Date.parse('2026-10-10'), {
    maxPrs: 200, maxPages: 2, fetchPage: async (n) => n === 1 ? page : [],
  });
  assert.equal(complete.truncated, false);
  assert.equal(complete.pagesScanned, 2);
  await assert.rejects(
    recentMergedPulls(Date.now(), { fetchPage: async () => ({ invalid: true }) }),
    /INVALID_GITHUB_PULL_PAGE/,
  );
});

test('change surfaces do not confuse migrations with published runtime code', async () => {
  const { classifyChangeSurfaces } = await import('../ops/release-coverage-audit.mjs');
  assert.deepEqual(classifyChangeSurfaces([
    'worker-airtrust/schema-v2/changes/0549.sql', 'scripts/schema-v2/preflight.sh',
  ]), ['CI_OPS', 'SCHEMA_V2']);
  assert.deepEqual(classifyChangeSurfaces([
    'worker-airtrust/src/routes/lms.ts', 'src/react-app/App.tsx',
  ]), ['PAGES', 'WORKER']);
  assert.deepEqual(classifyChangeSurfaces(['worker-airtrust/src/__tests__/lms.test.ts']), ['CI_OPS']);
  assert.deepEqual(classifyChangeSurfaces(['worker-airtrust/src/__tests__/fixtures.ts']), ['CI_OPS']);
  assert.deepEqual(classifyChangeSurfaces([]), ['UNKNOWN']);
  assert.deepEqual(classifyChangeSurfaces([{}]), ['UNKNOWN']);
});

test('workflow offers historical only by explicit manual choice', () => {
  const yaml = readFileSync('.github/workflows/release-coverage-audit.yml', 'utf8');
  assert.match(yaml, /type: choice\s+required: false\s+default: recent/);
  assert.match(yaml, /RELEASE_AUDIT_SCOPE:/);
});


test('historical batch demands explicit immutable anchor and safe offset', async () => {
  const { historicalBatchInput } = await import('../ops/release-coverage-audit.mjs');
  const stamp = '2026-10-11T20:00:00Z';
  assert.deepEqual(historicalBatchInput(stamp, '80'), {
    anchorUtc: stamp, anchorMs: Date.parse(stamp), offset: 80,
  });
  assert.throws(() => historicalBatchInput('', '0'), /ANCHOR_REQUIRED/);
  assert.throws(() => historicalBatchInput('2026-10-11', '0'), /ANCHOR_REQUIRED/);
  assert.throws(() => historicalBatchInput('2026-02-30T10:00:00Z', '0'), /ANCHOR_INVALID/);
  assert.throws(() => historicalBatchInput(stamp, '-1'), /OFFSET_INVALID/);
  assert.throws(() => historicalBatchInput(stamp, '1.3'), /OFFSET_INVALID/);
  assert.throws(() => historicalBatchInput(stamp, '2501'), /OFFSET_OUT_OF_RANGE/);
});

test('historical batches resume without skipping rows and never accept partial inventories', async () => {
  const { historicalBatchInput, selectHistoricalBatch } = await import('../ops/release-coverage-audit.mjs');
  const anchor = '2026-10-11T20:00:00Z';
  const input = historicalBatchInput(anchor, '0');
  const prs = Array.from({ length: 161 }, (_, i) => ({
    number: 1000 - i, mergedAt: new Date(Date.parse(anchor) - (i + 1) * 1000).toISOString(),
  }));
  // A later merge appears in a subsequent run: it is excluded by the fixed anchor.
  const newer = { number: 1001, mergedAt: new Date(Date.parse(anchor) + 1000).toISOString() };
  const scan = { prs: [newer, ...prs], truncated: false, pagesScanned: 3 };
  const first = selectHistoricalBatch(scan, input);
  assert.equal(first.prs.length, 80);
  assert.equal(first.nextOffset, 80);
  assert.equal(first.matchesFound, 161);
  const second = selectHistoricalBatch(scan, historicalBatchInput(anchor, '80'));
  assert.equal(second.nextOffset, 160);
  const third = selectHistoricalBatch(scan, historicalBatchInput(anchor, '160'));
  assert.equal(third.prs.length, 1);
  assert.equal(third.nextOffset, null);
  assert.equal(third.truncated, false);
  assert.deepEqual(
    [...first.prs, ...second.prs, ...third.prs].map((x) => x.number),
    prs.map((x) => x.number),
  );
  assert.throws(
    () => selectHistoricalBatch({ ...scan, truncated: true }, input),
    /HISTORICAL_INVENTORY_TRUNCATED/,
  );
  assert.throws(
    () => selectHistoricalBatch(scan, historicalBatchInput(anchor, '999')),
    /HISTORICAL_BATCH_OFFSET_OUT_OF_RANGE/,
  );
});

test('batch rate budget fails closed before GitHub comparison fanout', async () => {
  const { checkGithubRateBudget } = await import('../ops/release-coverage-audit.mjs');
  assert.deepEqual(checkGithubRateBudget(520, 80), { remaining: 520, required: 520, reserve: 120 });
  assert.throws(() => checkGithubRateBudget(519, 80), /GITHUB_CORE_RATE_BUDGET_INSUFFICIENT/);
  assert.throws(() => checkGithubRateBudget(undefined, 1), /GITHUB_CORE_RATE_BUDGET_INSUFFICIENT/);
});

test('manual batches have fixed UTC anchor and artifact retention without changing daily behavior', () => {
  const yaml = readFileSync('.github/workflows/release-coverage-audit.yml', 'utf8');
  assert.match(yaml, /historical-batch/);
  assert.match(yaml, /RELEASE_AUDIT_ANCHOR_UTC/);
  assert.match(yaml, /RELEASE_AUDIT_BATCH_OFFSET/);
  assert.match(yaml, /release-coverage-batch-\$\{\{ github\.run_id \}\}/);
});


test('off-main PR merges cannot be represented as main release provenance', async () => {
  const { recentMergedPulls } = await import('../ops/release-coverage-audit.mjs');
  const updated = '2026-10-11T21:00:00Z';
  const input = [
    { number: 42, merged_at: updated, updated_at: updated,
      merge_commit_sha: 'a'.repeat(40), base: { ref: 'main' } },
    { number: 61, merged_at: updated, updated_at: updated,
      merge_commit_sha: 'b'.repeat(40), base: { ref: 'fix/lms-e2e-reliability-final-20260827' } },
    { number: 55, merged_at: null, updated_at: updated,
      merge_commit_sha: null, base: { ref: 'main' } },
  ];
  const result = await recentMergedPulls(Date.parse('2026-10-10'), {
    fetchPage: async () => input,
  });
  assert.deepEqual(result.prs.map(x => x.number), [42]);
  assert.deepEqual(result.offMainMergedExcluded, [61]);
  assert.equal(result.truncated, false);
  await assert.rejects(
    recentMergedPulls(Date.parse('2026-10-10'), {
      fetchPage: async () => [{ number: 63, merged_at: updated, updated_at: updated }],
    }),
    /MERGED_PR_BASE_UNVERIFIED/,
  );
});
