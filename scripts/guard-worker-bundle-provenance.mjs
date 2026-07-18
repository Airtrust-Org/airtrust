#!/usr/bin/env node
/**
 * Guard: no stale/reusable Worker bundle artifact may ever be tracked again.
 * This is the direct remediation for the 2026-07-18 staging incident, where
 * a tracked worker-airtrust/.tmp-worker-bundle/ artifact from 2026-05-01
 * carried the legacy "Rota disponível apenas em localhost." string.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// AIRTRUST_GUARD_ROOT exists solely so scripts/__tests__/guard-worker-bundle-provenance.test.mjs
// can point this at a throwaway fake repo. It must never be set in CI/production.
const ROOT = process.env.AIRTRUST_GUARD_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

const files = trackedFiles();

// 1. No file under any bundle temp dir (current or legacy naming) may be tracked.
const BUNDLE_DIR_PATTERN = /(^|\/)worker-airtrust\/\.tmp-worker-bundle(-[^/]*)?\//;
const trackedBundleFiles = files.filter((f) => BUNDLE_DIR_PATTERN.test(f));
if (trackedBundleFiles.length > 0) {
  fail(`tracked files under a worker bundle temp dir: ${trackedBundleFiles.join(', ')}`);
}

// 2. .gitignore must actually declare the pattern (defense against silent removal).
const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
for (const pattern of [
  'worker-airtrust/.tmp-worker-bundle/',
  'worker-airtrust/.tmp-worker-bundle-*/',
  'worker-airtrust/wrangler.*.tmp.toml',
]) {
  if (!gitignore.includes(pattern)) {
    fail(`.gitignore missing required pattern: ${pattern}`);
  }
}

// 3. Deploy scripts must generate their bundle/output dir via mktemp -d, never
//    a fixed reusable path — a fixed path is exactly what let a stale bundle
//    from an old deploy silently answer a later request.
const deployScripts = files.filter(
  (f) => f.startsWith('scripts/') && f.includes('deploy') && f.endsWith('.sh'),
);
for (const scriptPath of deployScripts) {
  const content = readFileSync(join(ROOT, scriptPath), 'utf8');
  const referencesTmpBundleDir = /\.tmp-worker-bundle(?!-\*)/.test(content);
  if (referencesTmpBundleDir && !content.includes('mktemp')) {
    fail(`${scriptPath} references a tmp-worker-bundle path without using mktemp`);
  }
}

// 4. The legacy 403 message must never appear inside a tracked Worker runtime
//    artifact. It is allowed in documentation/tests that assert its absence.
const LEGACY_PHRASE = 'Rota disponível apenas em localhost.';
const ALLOWED_CONTEXT_DIRS = [
  'docs/',
  'src/__tests__/',
  'worker-airtrust/src/__tests__/',
  'scripts/__tests__/',
];
// This guard's own source must reference the phrase as a string literal to
// check for it — that is not an occurrence of legacy runtime behavior.
const SELF_PATH = 'scripts/guard-worker-bundle-provenance.mjs';
const runtimeCandidates = files.filter(
  (f) =>
    (f.startsWith('worker-airtrust/') || f.startsWith('scripts/')) &&
    f !== SELF_PATH &&
    !ALLOWED_CONTEXT_DIRS.some((dir) => f.startsWith(`worker-airtrust/${dir}`) || f.startsWith(dir)) &&
    !f.endsWith('.md'),
);
for (const filePath of runtimeCandidates) {
  let content;
  try {
    content = readFileSync(join(ROOT, filePath), 'utf8');
  } catch {
    continue; // binary or unreadable — not a text runtime artifact we can scan
  }
  if (content.includes(LEGACY_PHRASE)) {
    fail(`legacy 403 phrase found in tracked runtime artifact: ${filePath}`);
  }
}

if (failures.length > 0) {
  console.error('guard:worker-bundle-provenance FAILED');
  for (const item of failures) console.error(` - ${item}`);
  process.exit(1);
}

console.log('OK: guard:worker-bundle-provenance');
