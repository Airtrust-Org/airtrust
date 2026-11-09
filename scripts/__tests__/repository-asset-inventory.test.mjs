import assert from 'node:assert/strict';
import test from 'node:test';
import { assetCategories, parseTree, summarizeAssets } from '../ops/repository-asset-inventory.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const THIRD = 'c'.repeat(40);

test('categorizes SCORM, media, documents, images, and source maps', () => {
  assert.deepEqual(assetCategories('Arquivos - EAD/A/lesson.mp4'), ['scorm_content', 'media']);
  assert.deepEqual(assetCategories('docs/a.pdf'), ['pdf']);
  assert.deepEqual(assetCategories('Arquivos - EAD/A/slides.pptx'), ['scorm_content', 'powerpoint']);
  assert.deepEqual(assetCategories('public/logo.png'), ['image']);
  assert.deepEqual(assetCategories('public/app.js.map'), ['source_map']);
  assert.deepEqual(assetCategories('courses/a.zip'), ['scorm_archive']);
});

test('parses Git tree entries with whitespace and preserves object hashes', () => {
  const tree = Buffer.from(`100644 blob ${SHA} 300000\tArquivos - EAD/Course A/media file.mp4\0`);
  assert.deepEqual(parseTree(tree), [{
    gitBlobSha1: SHA, bytes: 300000, path: 'Arquivos - EAD/Course A/media file.mp4',
  }]);
});

test('reports exact duplicates and direct manifest references without delete authorization', () => {
  const manifest = 'Arquivos - EAD/Course A/imsmanifest.xml';
  const mediaA = 'Arquivos - EAD/Course A/media.mp4';
  const mediaB = 'Arquivos - EAD/Course B/media.mp4';
  const entries = [
    { gitBlobSha1: OTHER, bytes: 50, path: manifest },
    { gitBlobSha1: SHA, bytes: 300000, path: mediaA },
    { gitBlobSha1: SHA, bytes: 300000, path: mediaB },
    { gitBlobSha1: THIRD, bytes: 100, path: 'docs/guide.pdf' },
  ];
  const report = summarizeAssets(entries, [{
    file: manifest, xml: '<manifest><resource href="media.mp4" /></manifest>',
  }]);
  assert.equal(report.categories.media.files, 2);
  assert.equal(report.categories.scorm_content.files, 3);
  const uniquePdf = report.assets.find((entry) => entry.path === 'docs/guide.pdf');
  assert.deepEqual(uniquePdf, {
    gitBlobSha1: THIRD,
    path: 'docs/guide.pdf',
    bytes: 100,
    categories: ['pdf'],
    directManifestReference: false,
    referenceStatus: 'runtime-reference-not-audited',
    safeToDelete: false,
  });
  assert.equal(report.duplicateGroups.length, 1);
  assert.equal(report.duplicateGroups[0].gitBlobSha1, SHA);
  assert.equal(report.duplicateGroups[0].paths[0].directManifestReference, true);
  assert.ok(report.duplicateGroups[0].paths.every((entry) => !entry.safeToDelete));
  assert.equal(report.deletionAuthorized, false);
});

test('identifies missing manifest targets and keeps external references out of local inventory', () => {
  const manifest = 'Arquivos - EAD/Course A/imsmanifest.xml';
  const report = summarizeAssets([
    { gitBlobSha1: OTHER, bytes: 50, path: manifest },
  ], [{ file: manifest, xml: '<manifest><file href="missing.pdf"/><file href="https://example.org/x"/></manifest>' }]);
  assert.deepEqual(report.missingManifestReferences, [{
    manifest, file: 'Arquivos - EAD/Course A/missing.pdf', safeToDelete: false,
  }]);
});
