#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEAVY_CHUNK_NAMES = new Set(['charts', 'pdf', 'capture', 'excel']);

function fail(message) {
  throw new Error(message);
}

export function findEntryKey(manifest) {
  const entries = Object.entries(manifest).filter(([, value]) => value?.isEntry === true);
  if (entries.length !== 1) {
    fail(`expected exactly one frontend entry chunk, found ${entries.length}`);
  }
  return entries[0][0];
}

export function collectStaticClosure(manifest, entryKey) {
  const seen = new Set();
  const queue = [entryKey];

  while (queue.length > 0) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    seen.add(key);

    const item = manifest[key];
    if (!item) fail(`manifest import points to missing chunk: ${key}`);
    for (const imported of item.imports ?? []) queue.push(imported);
  }

  return seen;
}

function normalizedChunkName(item) {
  if (typeof item?.name === 'string' && item.name) return item.name;
  const file = typeof item?.file === 'string' ? basename(item.file) : '';
  return file.replace(/-[A-Za-z0-9_-]+\.js$/u, '').replace(/\.js$/u, '');
}

export function assertHeavyChunksAreLazy(manifest) {
  const entryKey = findEntryKey(manifest);
  const staticClosure = collectStaticClosure(manifest, entryKey);
  const violations = [];

  for (const key of staticClosure) {
    const item = manifest[key];
    const name = normalizedChunkName(item);
    if (HEAVY_CHUNK_NAMES.has(name)) {
      violations.push({ key, name, file: item.file });
    }
  }

  if (violations.length > 0) {
    fail(
      `heavy frontend chunks leaked into initial static entry closure: ${violations
        .map((v) => `${v.name}(${v.file ?? v.key})`)
        .join(', ')}`,
    );
  }

  return { entryKey, staticClosure: [...staticClosure] };
}

function resolveManifestPath(explicit) {
  const candidates = explicit
    ? [explicit]
    : ['dist/client/manifest.json', 'dist/client/.vite/manifest.json'];

  for (const candidate of candidates) {
    const absolute = resolve(candidate);
    if (existsSync(absolute)) return absolute;
  }
  fail(`frontend manifest not found; checked: ${candidates.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const manifestPath = resolveManifestPath(process.argv[2]);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const result = assertHeavyChunksAreLazy(manifest);

  const summary = result.staticClosure.map((key) => {
    const item = manifest[key];
    const file = item.file ? resolve('dist/client', item.file) : null;
    const bytes = file && existsSync(file) ? statSync(file).size : null;
    return { key, name: normalizedChunkName(item), file: item.file ?? null, bytes };
  });

  process.stdout.write(
    `${JSON.stringify({
      manifest: manifestPath,
      entry: result.entryKey,
      staticEntryChunks: summary,
      blockedFromInitialClosure: [...HEAVY_CHUNK_NAMES],
    })}\n`,
  );
}
