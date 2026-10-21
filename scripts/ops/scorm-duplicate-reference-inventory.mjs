#!/usr/bin/env node
/**
 * Read-only inventory of identical tracked EAD blobs.
 *
 * This tool never deletes, renames, modifies manifests, or concludes that
 * an unlisted asset is safe to remove. Indirect imports from JS/CSS/SCORM
 * runtime and references inside course data remain possible.
 */
import { execFileSync } from 'node:child_process';
import { posix as pathPosix } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MIN_BYTES = 256 * 1024;
const SOURCE_ROOT = 'Arquivos - EAD/';

export function parseGitTree(buffer) {
  return Buffer.from(buffer).toString('utf8').split('\0').flatMap((line) => {
    const match = line.match(/^[0-7]{6} blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/);
    return match ? [{ sha: match[1], bytes: Number(match[2]), file: match[3] }] : [];
  });
}

export function manifestDeclaredPaths(xml, manifestPath) {
  const declared = new Set();
  const base = pathPosix.dirname(manifestPath);
  const matches = String(xml).matchAll(/<(?:[A-Za-z0-9_-]+:)?(?:file|resource)\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi);
  for (const item of matches) {
    let href = String(item[2] || '').trim().split(/[?#]/, 1)[0];
    if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(href)) continue;
    href = href.replaceAll('\\', '/');
    try { href = decodeURIComponent(href); } catch { /* Retain literal path. */ }
    const resolved = pathPosix.normalize(pathPosix.join(base, href));
    if (resolved.startsWith(SOURCE_ROOT) && !resolved.includes('/../')) declared.add(resolved);
  }
  return declared;
}

/**
 * Reports literal tracked paths missing from package manifests. This is
 * diagnostic only: URL decoding, case-sensitive hosting and generated runtime
 * assets require a separate review before any package asset is changed.
 */
export function findMissingManifestReferences(entries, manifests) {
  const tracked = new Set(entries.map(({ file }) => file));
  const missing = [];
  for (const { file: manifestPath, xml } of manifests) {
    for (const declaredPath of manifestDeclaredPaths(xml, manifestPath)) {
      if (!tracked.has(declaredPath)) {
        missing.push({ manifest: manifestPath, file: declaredPath, safeToDelete: false });
      }
    }
  }
  return missing.sort((a, b) =>
    a.manifest.localeCompare(b.manifest) || a.file.localeCompare(b.file));
}

export function findDuplicateGroups(entries, declaredPaths = new Set(), minBytes = DEFAULT_MIN_BYTES) {
  if (!Number.isSafeInteger(minBytes) || minBytes < 1) throw Error('MIN_BYTES_INVALID');
  const blobs = new Map();
  for (const entry of entries) {
    if (!entry.file.startsWith(SOURCE_ROOT) || entry.bytes < minBytes) continue;
    if (!Number.isSafeInteger(entry.bytes) || !/^[a-f0-9]{40}$/.test(entry.sha)) continue;
    const group = blobs.get(entry.sha) || [];
    group.push(entry);
    blobs.set(entry.sha, group);
  }
  return [...blobs.entries()].filter(([, group]) => group.length > 1)
    .map(([sha, group]) => {
      const bytes = group[0].bytes;
      return {
        sha,
        blobBytes: bytes,
        copies: group.length,
        logicalDuplicateBytes: bytes * (group.length - 1),
        paths: group.map(({ file }) => ({
          file,
          explicitlyDeclaredInManifest: declaredPaths.has(file),
          // No package source or dynamically loaded runtime references are excluded.
          safeToDelete: false,
        })),
      };
    }).sort((a, b) => b.logicalDuplicateBytes - a.logicalDuplicateBytes);
}

export function summarize(groups, manifestCount, missingManifestCount = 0) {
  return {
    trackedManifestCount: manifestCount,
    missingManifestReferences: missingManifestCount,
    duplicateGroups: groups.length,
    duplicateCopies: groups.reduce((n, group) => n + group.copies - 1, 0),
    logicalDuplicateBytes: groups.reduce((n, group) => n + group.logicalDuplicateBytes, 0),
    directManifestReferencedCopies: groups.reduce(
      (n, group) => n + group.paths.filter((p) => p.explicitlyDeclaredInManifest).length, 0,
    ),
    deletionAuthorized: false,
    warning: 'Identical blobs may be required by independent SCORM packages, JS/CSS imports, player resume or published URLs. No file can be deleted from this report alone.',
  };
}

export function scanRepository() {
  const tree = parseGitTree(execFileSync('git', [
    'ls-tree', '-r', '-l', '-z', 'HEAD', '--', 'Arquivos - EAD',
  ], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }));
  const manifests = tree.filter((entry) => entry.file.toLowerCase().endsWith('/imsmanifest.xml'));
  const refs = new Set();
  const manifestSources = [];
  for (const manifest of manifests) {
    const xml = execFileSync('git', ['show', 'HEAD:' + manifest.file], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    manifestSources.push({ file: manifest.file, xml });
    for (const href of manifestDeclaredPaths(xml, manifest.file)) refs.add(href);
  }
  const groups = findDuplicateGroups(tree, refs);
  const missingManifestReferences = findMissingManifestReferences(tree, manifestSources);
  return {
    summary: summarize(groups, manifests.length, missingManifestReferences.length),
    missingManifestReferences,
    groups,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const report = scanRepository();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
