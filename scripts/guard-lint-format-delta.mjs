#!/usr/bin/env node
// Blocks new ESLint and Prettier violations only in files changed by the current branch.
// The repository may keep a documented legacy baseline, but a pull request cannot worsen it.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ESLINT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const PRETTIER_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
  '.html',
]);

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function resolveBaseRef(env = process.env, cliArg = process.argv[2]) {
  if (cliArg) return cliArg;
  if (env.GUARD_LINT_DELTA_BASE_REF) return env.GUARD_LINT_DELTA_BASE_REF;
  if (env.GITHUB_BASE_REF) return `origin/${env.GITHUB_BASE_REF}`;
  return 'origin/main';
}

export function selectDeltaFiles(files, cwd = process.cwd()) {
  const normalized = [...new Set(files.map((file) => file.trim()).filter(Boolean))]
    .filter((file) => !file.startsWith('node_modules/'))
    .filter((file) => !file.startsWith('dist/'))
    .filter((file) => existsSync(path.resolve(cwd, file)));

  return {
    eslintFiles: normalized.filter((file) =>
      ESLINT_EXTENSIONS.has(path.extname(file).toLowerCase()),
    ),
    prettierFiles: normalized.filter((file) =>
      PRETTIER_EXTENSIONS.has(path.extname(file).toLowerCase()),
    ),
  };
}

export function parseChangedFileStatus(raw) {
  const fields = raw.split('\0').filter(Boolean);
  const files = [];
  const exactCopies = [];

  for (let index = 0; index < fields.length; ) {
    const status = fields[index++] ?? '';
    if (/^[RC]\d+$/.test(status)) {
      const source = fields[index++] ?? '';
      const destination = fields[index++] ?? '';
      if (status === 'C100') {
        exactCopies.push({ source, destination });
      } else if (destination) {
        files.push(destination);
      }
      continue;
    }

    const file = fields[index++] ?? '';
    if (file) files.push(file);
  }

  return { files, exactCopies };
}

export function readChangedFiles({ cwd = process.cwd(), baseRef = resolveBaseRef() } = {}) {
  const mergeBase = git(['merge-base', baseRef, 'HEAD'], cwd).trim();
  const raw = execFileSync(
    'git',
    [
      'diff',
      '--name-status',
      '-M',
      '-C',
      '--find-copies-harder',
      '--diff-filter=ACMR',
      '-z',
      `${mergeBase}...HEAD`,
    ],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return { ...parseChangedFileStatus(raw), mergeBase, baseRef };
}

function annotationEscape(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function emitDiffChunks(file, diff) {
  const chunkSize = 3000;
  const chunks = [];
  for (let index = 0; index < diff.length; index += chunkSize) {
    chunks.push(diff.slice(index, index + chunkSize));
  }
  chunks.forEach((chunk, index) => {
    console.error(
      `::error title=prettier fix ${path.basename(file)} ${index + 1}/${chunks.length}::${annotationEscape(chunk)}`,
    );
  });
}

function run(command, args, cwd) {
  try {
    const output = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (output) process.stdout.write(output);
  } catch (error) {
    if (command === 'npx' && args.includes('prettier@3.9.6') && args.includes('--check')) {
      const writeArgs = args.map((arg) => (arg === '--check' ? '--write' : arg));
      execFileSync(command, writeArgs, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const separator = args.indexOf('--');
      const files = separator >= 0 ? args.slice(separator + 1) : [];
      for (const file of files) {
        const diff = git(['diff', '--', file], cwd).trim();
        if (diff) emitDiffChunks(file, diff);
      }
    }
    throw error;
  }
}

export function runGuard({ cwd = process.cwd(), baseRef = resolveBaseRef() } = {}) {
  const changed = readChangedFiles({ cwd, baseRef });
  const selected = selectDeltaFiles(changed.files, cwd);

  if (selected.eslintFiles.length > 0) {
    run('npx', ['eslint', '--max-warnings=0', '--', ...selected.eslintFiles], cwd);
  }

  if (selected.prettierFiles.length > 0) {
    run('npx', ['--yes', 'prettier@3.9.6', '--check', '--', ...selected.prettierFiles], cwd);
  }

  return { ...changed, ...selected };
}

function main() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = runGuard({ cwd });
  console.log(
    `OK: delta lint/format gate checked ${result.eslintFiles.length} ESLint file(s) and ${result.prettierFiles.length} Prettier file(s) vs ${result.baseRef} (${result.mergeBase}); ignored ${result.exactCopies.length} exact compatibility copy/copies`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error('RESULT: FAIL — changed files contain ESLint or Prettier violations.');
    if (error instanceof Error && error.message) console.error(error.message);
    process.exit(1);
  }
}
