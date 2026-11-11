import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertProductionShaPair,
  assertLiveProductionProvenance,
} from '../frms-production-provenance.mjs';

const WORKER = 'a'.repeat(40);
const PAGES = 'b'.repeat(40);
const html = `<!doctype html><html><body><div data-build="2026-11-11T19:04:33Z-${PAGES.slice(0, 7)}"></div></body></html>`;
const fixture = (worker = WORKER, page = html) => ({
  expectedWorkerSha: WORKER,
  expectedPagesSha: PAGES,
  versionJson: { data: { sourceSha: worker } },
  frontendHtml: page,
});

test('accepts exact Worker SHA plus unique source-stamped Pages build', () => {
  assert.equal(assertProductionShaPair(fixture()), true);
});

test('rejects a changed Worker deployment with fail-closed error', () => {
  assert.throws(() => assertProductionShaPair(fixture('c'.repeat(40))), /FRMS_PRODUCTION_WORKER_SHA_MISMATCH/);
});

test('rejects a changed Pages deployment with fail-closed error', () => {
  assert.throws(() => assertProductionShaPair(fixture(WORKER, html.replace('bbbbbbb', 'ccccccc'))), /FRMS_PRODUCTION_PAGES_SHA_MISMATCH/);
});

test('rejects missing or ambiguous Pages stamps', () => {
  assert.throws(() => assertProductionShaPair(fixture(WORKER, '<html>unstamped</html>')), /FRMS_PRODUCTION_PAGES_SHA_MISMATCH/);
  assert.throws(() => assertProductionShaPair(fixture(WORKER, html + html)), /FRMS_PRODUCTION_PAGES_SHA_MISMATCH/);
});

test('rejects incomplete expected provenance', () => {
  assert.throws(() => assertProductionShaPair({ ...fixture(), expectedPagesSha: 'bbbbbbb' }), /EXPECTED_SHA_INVALID/);
  assert.throws(() => assertProductionShaPair({ ...fixture(), expectedWorkerSha: '' }), /EXPECTED_SHA_INVALID/);
});

test('detects production replacement between approval and browser execution', async () => {
  let servedWorker = WORKER;
  const fetcher = async (url) => {
    if (url.endsWith('/api/version')) {
      return new Response(JSON.stringify({ data: { sourceSha: servedWorker } }), { status: 200 });
    }
    if (url.endsWith('/login')) return new Response(html, { status: 200 });
    throw new Error('UNEXPECTED_HOST');
  };
  await assertLiveProductionProvenance(WORKER, PAGES, fetcher);
  servedWorker = 'd'.repeat(40);
  await assert.rejects(
    assertLiveProductionProvenance(WORKER, PAGES, fetcher),
    /FRMS_PRODUCTION_WORKER_SHA_MISMATCH/,
  );
});

test('rejects failed HTTP provenance probes before reading payloads', async () => {
  await assert.rejects(assertLiveProductionProvenance(WORKER, PAGES, async () => new Response('', { status: 503 })),
    /FRMS_PRODUCTION_VERSION_HTTP_NOT_200/);
});
