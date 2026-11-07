import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseGitTree, manifestDeclaredPaths, findManifestPathIssues, findMissingManifestReferences,
  findDuplicateGroups, summarize,
} from '../ops/scorm-duplicate-reference-inventory.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const ROOT = 'Arquivos - EAD';

test('Git tree parser handles paths with whitespace without reading large media', () => {
  const tree = Buffer.from(
    '100644 blob ' + SHA + ' 300000\t' + ROOT + '/Course A/media file.mp4\0' +
    '100644 blob ' + SHA + ' 300000\t' + ROOT + '/Course B/media file.mp4\0' +
    '100644 blob ' + OTHER + '     20\t' + ROOT + '/Course A/imsmanifest.xml\0',
  );
  assert.equal(parseGitTree(tree).length, 3);
  assert.equal(parseGitTree(tree)[0].file, ROOT + '/Course A/media file.mp4');
});

test('parses direct manifest references without escaping tracked EAD root', () => {
  const manifestPath = ROOT + '/Course A/imsmanifest.xml';
  const xml = [
    '<manifest>',
    '<resource identifier="SCO" href="index.html"><file href="media%20file.mp4"/></resource>',
    '<file href="../../not-in-ead/secrets.txt"/>',
    '<file href="https://example.org/external.js"/>',
    '</manifest>',
  ].join('');
  const found = manifestDeclaredPaths(xml, manifestPath);
  assert.equal(found.has(ROOT + '/Course A/index.html'), true);
  assert.equal(found.has(ROOT + '/Course A/media file.mp4'), true);
  assert.equal(found.size, 2);
});

test('logical duplicated bytes are not permission to delete course files', () => {
  const entries = [
    { sha: SHA, bytes: 300000, file: ROOT + '/Course A/media file.mp4' },
    { sha: SHA, bytes: 300000, file: ROOT + '/Course B/media file.mp4' },
    { sha: OTHER, bytes: 100, file: ROOT + '/Course B/readme.txt' },
  ];
  const groups = findDuplicateGroups(entries, new Set([ROOT + '/Course A/media file.mp4']));
  const summary = summarize(groups, 2);
  assert.equal(groups.length, 1);
  assert.equal(summary.logicalDuplicateBytes, 300000);
  assert.equal(summary.duplicateCopies, 1);
  assert.equal(summary.directManifestReferencedCopies, 1);
  assert.equal(summary.deletionAuthorized, false);
  assert.ok(groups[0].paths.every((p) => p.safeToDelete === false));
});

test('inventory reports exact manifest paths missing from tracked tree without deletion authorization', () => {
  const manifest = ROOT + '/Emergencias/imsmanifest.xml';
  const declared = ROOT + '/Emergencias/fit_content_assets/Sem_títulosds_qihroh.png';
  const encodedOnDisk = ROOT + '/Emergencias/fit_content_assets/Sem_t%C3%ADtulosds_qihroh.png';
  const entries = [
    { sha: SHA, bytes: 200, file: manifest },
    { sha: OTHER, bytes: 200, file: encodedOnDisk },
  ];
  const sources = [{
    file: manifest,
    xml: '<manifest><resources><resource href="index.html"><file href="fit_content_assets/Sem_t%C3%ADtulosds_qihroh.png" /></resource></resources></manifest>',
  }];
  const issues = findManifestPathIssues(entries, sources);
  assert.deepEqual(findMissingManifestReferences(entries, sources), issues.missingManifestReferences);
  assert.deepEqual(issues.missingManifestReferences, [
    { manifest, file: ROOT + '/Emergencias/index.html', safeToDelete: false },
  ]);
  assert.deepEqual(issues.encodedLiteralManifestReferences, [{
    manifest, file: declared, literalFile: encodedOnDisk,
    runtimeVerified: false, safeToDelete: false,
  }]);
  const summary = summarize([], 1, issues.missingManifestReferences.length,
    issues.encodedLiteralManifestReferences.length);
  assert.equal(summary.missingManifestReferences, 1);
  assert.equal(summary.encodedLiteralManifestReferences, 1);
  assert.equal(summary.deletionAuthorized, false);
});

test('inventory skips external paths and accepts tracked local manifest references', () => {
  const manifest = ROOT + '/Course A/imsmanifest.xml';
  const file = ROOT + '/Course A/media file.mp4';
  const entries = [
    { sha: SHA, bytes: 180, file: manifest },
    { sha: OTHER, bytes: 300000, file },
  ];
  const sources = [{
    file: manifest,
    xml: '<manifest><resources><resource href="media%20file.mp4" /><file href="https://example.org/remote.jpg"/><file href="../../untracked.txt" /></resources></manifest>',
  }];
  assert.deepEqual(findMissingManifestReferences(entries, sources), []);
  assert.equal(summarize([], 1).missingManifestReferences, 0);
});

test('truly missing encoded resource stays missing when neither tracked path exists', () => {
  const manifest = ROOT + '/Course A/imsmanifest.xml';
  const entries = [{ sha: SHA, bytes: 200, file: manifest }];
  const sources = [{
    file: manifest,
    xml: '<manifest><resource href="images/absent%20file.jpg" /></manifest>',
  }];
  const result = findManifestPathIssues(entries, sources);
  assert.deepEqual(result.missingManifestReferences, [{
    manifest, file: ROOT + '/Course A/images/absent file.jpg', safeToDelete: false,
  }]);
  assert.deepEqual(result.encodedLiteralManifestReferences, []);
});

test('encoded literal path cannot authorize asset removal or claim runtime verified', () => {
  const manifest = ROOT + '/Course A/imsmanifest.xml';
  const literal = ROOT + '/Course A/fit_content_assets/Sem_t%C3%ADtulos.png';
  const sources = [{ file: manifest, xml: '<file href="fit_content_assets/Sem_t%C3%ADtulos.png"/>' }];
  const result = findManifestPathIssues([{ sha: SHA, bytes: 200, file: literal }], sources);
  assert.equal(result.missingManifestReferences.length, 0);
  assert.equal(result.encodedLiteralManifestReferences.length, 1);
  assert.equal(result.encodedLiteralManifestReferences[0].runtimeVerified, false);
  assert.equal(result.encodedLiteralManifestReferences[0].safeToDelete, false);
  assert.equal(summarize([], 1, 0, 1).deletionAuthorized, false);
});
