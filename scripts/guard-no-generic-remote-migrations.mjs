#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REMOTE_MIGRATIONS_APPLY_ALLOWLIST = new Set([
  'scripts/production/apply-simuladores-matriz-remote-migration.sh',
]);

const SCANNED_EXTENSIONS = new Set([
  '.sh',
  '.mjs',
  '.cjs',
  '.js',
  '.ts',
  '.tsx',
  '.yml',
  '.yaml',
]);
const GENERIC_REMOTE_APPLY =
  /\bwrangler\s+d1\s+migrations\s+apply\b[\s\S]{0,500}?\s--remote(?:\s|$)/m;

function stripComments(source, extension) {
  if (extension === '.sh' || extension === '.yml' || extension === '.yaml') {
    return source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
  }
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

export function findGenericRemoteMigrationApplyViolations({ root, files }) {
  const violations = [];
  for (const relativePath of [...files].sort()) {
    const normalized = relativePath.split(path.sep).join('/');
    const extension = path.extname(normalized);
    if (!SCANNED_EXTENSIONS.has(extension)) continue;
    if (
      normalized.includes('/__tests__/') ||
      /\.(?:test|spec)\.[^.]+$/.test(normalized)
    ) {
      continue;
    }
    const fullPath = path.join(root, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    const source = stripComments(fs.readFileSync(fullPath, 'utf8'), extension);
    if (!GENERIC_REMOTE_APPLY.test(source)) continue;
    if (REMOTE_MIGRATIONS_APPLY_ALLOWLIST.has(normalized)) continue;
    violations.push(normalized);
  }
  return violations;
}

export function runNoGenericRemoteMigrationsGuard({ root = process.cwd(), files } = {}) {
  const trackedFiles =
    files ??
    execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  const violations = findGenericRemoteMigrationApplyViolations({
    root,
    files: trackedFiles,
  });
  return {
    ok: violations.length === 0,
    allowlist: [...REMOTE_MIGRATIONS_APPLY_ALLOWLIST].sort(),
    violations,
  };
}

function main() {
  const result = runNoGenericRemoteMigrationsGuard();
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
