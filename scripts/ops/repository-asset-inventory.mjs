#!/usr/bin/env node
/** Read-only inventory of tracked course and document assets at HEAD. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findManifestPathIssues, manifestDeclaredPaths } from './scorm-duplicate-reference-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EAD_ROOT = 'Arquivos - EAD/';
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'tif', 'tiff']);
const VIDEO_AUDIO = new Set(['mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'mov', 'vtt']);

export function parseTree(buffer) {
  return Buffer.from(buffer).toString('utf8').split('\0').flatMap((line) => {
    const m = line.match(/^[0-7]{6} blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/);
    return m ? [{ gitBlobSha1: m[1], bytes: Number(m[2]), path: m[3] }] : [];
  });
}

export function assetCategories(file) {
  const ext = file.split('.').pop().toLowerCase();
  const categories = [];
  if (file.startsWith(EAD_ROOT)) categories.push('scorm_content');
  if (ext === 'zip') categories.push('scorm_archive');
  if (ext === 'pdf') categories.push('pdf');
  if (ext === 'ppt' || ext === 'pptx') categories.push('powerpoint');
  if (IMAGE.has(ext)) categories.push('image');
  if (VIDEO_AUDIO.has(ext)) categories.push('media');
  if (ext === 'map' || file.endsWith('.js.map') || file.endsWith('.css.map')) categories.push('source_map');
  return categories;
}

export function summarizeAssets(entries, manifests = []) {
  const counts = Object.fromEntries([
    'scorm_content', 'scorm_archive', 'pdf', 'powerpoint', 'image', 'media', 'source_map',
  ].map((category) => [category, { files: 0, bytes: 0 }]));
  const duplicateCandidates = new Map();
  const assets = [];
  const tracked = new Set(entries.map((entry) => entry.path));
  const manifestPaths = new Set();
  const manifestIssues = findManifestPathIssues(
    entries.map(({ path: file }) => ({ file })), manifests,
  );
  for (const { file, xml } of manifests) {
    for (const path of manifestDeclaredPaths(xml, file)) manifestPaths.add(path);
  }
  for (const entry of entries) {
    const categories = assetCategories(entry.path);
    if (!categories.length) continue;
    for (const category of categories) {
      const row = counts[category] || (counts[category] = { files: 0, bytes: 0 });
      row.files++;
      row.bytes += entry.bytes;
    }
    const asset = {
      gitBlobSha1: entry.gitBlobSha1,
      path: entry.path,
      bytes: entry.bytes,
      categories,
      directManifestReference: manifestPaths.has(entry.path),
      referenceStatus: entry.path.startsWith(EAD_ROOT)
        ? (manifestPaths.has(entry.path) ? 'manifest-referenced' : 'manifest-not-referenced; runtime-reference-unknown')
        : 'runtime-reference-not-audited',
      safeToDelete: false,
    };
    assets.push(asset);
    const group = duplicateCandidates.get(entry.gitBlobSha1) || [];
    group.push(asset);
    duplicateCandidates.set(entry.gitBlobSha1, group);
  }
  const duplicateGroups = [...duplicateCandidates]
    .filter(([, group]) => group.length > 1)
    .map(([gitBlobSha1, paths]) => ({
      gitBlobSha1,
      copies: paths.length,
      bytesPerCopy: paths[0].bytes,
      logicalDuplicateBytes: paths[0].bytes * (paths.length - 1),
      paths,
      safeToDelete: false,
    }))
    .sort((a, b) => b.logicalDuplicateBytes - a.logicalDuplicateBytes || a.gitBlobSha1.localeCompare(b.gitBlobSha1));
  return {
    trackedFiles: entries.length,
    hashFormat: 'Git blob SHA-1 object ID (exact tracked blob identity)',
    categories: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    assets,
    scormManifests: manifests.length,
    missingManifestReferences: manifestIssues.missingManifestReferences,
    encodedLiteralManifestReferences: manifestIssues.encodedLiteralManifestReferences,
    duplicateGroups,
    duplicateCopies: duplicateGroups.reduce((sum, group) => sum + group.copies - 1, 0),
    logicalDuplicateBytes: duplicateGroups.reduce((sum, group) => sum + group.logicalDuplicateBytes, 0),
    deletionAuthorized: false,
    note: 'Manifest checks cover direct imsmanifest.xml paths only. Other runtime, URL, import, course, and release references are not proven absent; no deletion is authorized.',
  };
}

export function scanRepository() {
  const ref = process.env.ASSET_INVENTORY_REF || 'HEAD';
  const entries = parseTree(execFileSync('git', ['ls-tree', '-r', '-l', '-z', ref], {
    cwd: ROOT, maxBuffer: 64 * 1024 * 1024,
  }));
  const manifests = entries.filter(({ path: file }) =>
    file.startsWith(EAD_ROOT) && file.toLowerCase().endsWith('/imsmanifest.xml'))
    .map(({ path: file }) => ({
      file,
      xml: execFileSync('git', ['show', ref + ':' + file], {
        cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      }),
    }));
  return { sourceSha: execFileSync('git', ['rev-parse', ref], { cwd: ROOT, encoding: 'utf8' }).trim(),
    ...summarizeAssets(entries, manifests) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.write(JSON.stringify(scanRepository(), null, 2) + '\n');
}
