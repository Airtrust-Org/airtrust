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
