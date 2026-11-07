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

function manifestReferenceVariants(xml, manifestPath) {
  const base = pathPosix.dirname(manifestPath);
  const variants = new Map();
  const matches = String(xml).matchAll(/<(?:[A-Za-z0-9_-]+:)?(?:file|resource)\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi);
  for (const item of matches) {
    const href = String(item[2] || '').trim().split(/[?#]/, 1)[0];
    if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(href)) continue;
    const literalHref = href.replaceAll('\\', '/');
    let decodedHref = literalHref;
    try { decodedHref = decodeURIComponent(literalHref); } catch { /* Retain literal path. */ }
    const decodedPath = pathPosix.normalize(pathPosix.join(base, decodedHref));
    const literalPath = pathPosix.normalize(pathPosix.join(base, literalHref));
    if (!decodedPath.startsWith(SOURCE_ROOT) || decodedPath.includes('/../')) continue;
    if (!literalPath.startsWith(SOURCE_ROOT) || literalPath.includes('/../')) continue;
    variants.set(decodedPath + '\0' + literalPath, { decodedPath, literalPath });
  }
  return [...variants.values()];
}

export function manifestDeclaredPaths(xml, manifestPath) {
  return new Set(manifestReferenceVariants(xml, manifestPath).map(({ decodedPath }) => decodedPath));
}

/**
 * Separates truly missing tracked manifest assets from ambiguous URL-encoded
 * filenames that are present literally in Git but not after decoding.
 * Neither class proves runtime failure or authorizes file deletion.
 */
export function findManifestPathIssues(entries, manifests) {
  const tracked = new Set(entries.map(({ file }) => file));
  const missingManifestReferences = [];
  const encodedLiteralManifestReferences = [];
  for (const { file: manifestPath, xml } of manifests) {
    for (const { decodedPath, literalPath } of manifestReferenceVariants(xml, manifestPath)) {
      if (tracked.has(decodedPath)) continue;
      if (literalPath !== decodedPath && tracked.has(literalPath)) {
        encodedLiteralManifestReferences.push({
          manifest: manifestPath, file: decodedPath, literalFile: literalPath,
          runtimeVerified: false, safeToDelete: false,
        });
      } else {
        missingManifestReferences.push({
          manifest: manifestPath, file: decodedPath, safeToDelete: false,
        });
      }
    }
  }
  const order = (a, b) => a.manifest.localeCompare(b.manifest) || a.file.localeCompare(b.file);
  missingManifestReferences.sort(order);
  encodedLiteralManifestReferences.sort(order);
  return { missingManifestReferences, encodedLiteralManifestReferences };
}

/** Backwards-compatible accessor for genuinely absent paths. */
export function findMissingManifestReferences(entries, manifests) {
  return findManifestPathIssues(entries, manifests).missingManifestReferences;
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

export function summarize(groups, manifestCount, missingManifestCount = 0, encodedLiteralCount = 0) {
  return {
    trackedManifestCount: manifestCount,
    missingManifestReferences: missingManifestCount,
    encodedLiteralManifestReferences: encodedLiteralCount,
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
  const tracked = new Set(tree.map(({ file }) => file));
  const manifestSources = [];
  for (const manifest of manifests) {
    const xml = execFileSync('git', ['show', 'HEAD:' + manifest.file], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    manifestSources.push({ file: manifest.file, xml });
    for (const { decodedPath, literalPath } of manifestReferenceVariants(xml, manifest.file)) {
      refs.add(tracked.has(decodedPath) ? decodedPath : tracked.has(literalPath) ? literalPath : decodedPath);
    }
  }
  const groups = findDuplicateGroups(tree, refs);
  const { missingManifestReferences, encodedLiteralManifestReferences } =
    findManifestPathIssues(tree, manifestSources);
  return {
    summary: summarize(groups, manifests.length, missingManifestReferences.length,
      encodedLiteralManifestReferences.length),
    missingManifestReferences,
    encodedLiteralManifestReferences,
    groups,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const report = scanRepository();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
