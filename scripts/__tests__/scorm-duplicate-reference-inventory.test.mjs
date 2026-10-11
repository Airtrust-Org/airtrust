import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseGitTree, manifestDeclaredPaths, findDuplicateGroups, summarize,
} from '../ops/scorm-duplicate-reference-inventory.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const ROOT = 'Arquivos - EAD';

test('Git tree parser handles paths with whitespace without reading large media', () => {
  const tree = Buffer.from(
    '100644 blob ' + SHA + ' 300000\t' + ROOT + '/Course A/media file.mp4\0' +
    '100644 blob ' + SHA + ' 300000\t' + ROOT + '/Course B/media file.mp4\0' +
    '100644 blob ' + OTHER + ' 20\t' + ROOT + '/Course A/imsmanifest.xml\0',
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
