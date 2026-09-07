import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertHeavyChunksAreLazy,
  collectStaticClosure,
  findEntryKey,
} from './check-frontend-entry-chunks.mjs';

test('walks only static imports from the entry and ignores dynamic route imports', () => {
  const manifest = {
    'index.html': {
      file: 'assets/index-a.js',
      isEntry: true,
      imports: ['_vendor.js'],
      dynamicImports: ['src/pages/reports.tsx'],
    },
    '_vendor.js': { file: 'assets/vendor-b.js', name: 'vendor' },
    'src/pages/reports.tsx': {
      file: 'assets/reports-c.js',
      imports: ['_charts.js', '_pdf.js'],
    },
    '_charts.js': { file: 'assets/charts-d.js', name: 'charts' },
    '_pdf.js': { file: 'assets/pdf-e.js', name: 'pdf' },
  };

  assert.equal(findEntryKey(manifest), 'index.html');
  assert.deepEqual([...collectStaticClosure(manifest, 'index.html')].sort(), [
    '_vendor.js',
    'index.html',
  ]);
  assert.doesNotThrow(() => assertHeavyChunksAreLazy(manifest));
});

test('fails when a heavy manual chunk becomes a static dependency of first paint', () => {
  const manifest = {
    'index.html': {
      file: 'assets/index-a.js',
      isEntry: true,
      imports: ['_vendor.js', '_charts.js'],
    },
    '_vendor.js': { file: 'assets/vendor-b.js', name: 'vendor' },
    '_charts.js': { file: 'assets/charts-d.js', name: 'charts' },
  };

  assert.throws(
    () => assertHeavyChunksAreLazy(manifest),
    /heavy frontend chunks leaked into initial static entry closure: charts/,
  );
});

test('fails closed on an ambiguous or malformed manifest', () => {
  assert.throws(() => findEntryKey({}), /expected exactly one frontend entry chunk/);
  assert.throws(
    () =>
      collectStaticClosure(
        { 'index.html': { isEntry: true, imports: ['missing'] } },
        'index.html',
      ),
    /missing chunk/,
  );
});
