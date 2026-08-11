#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DML_PATTERNS = [
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bREPLACE\s+INTO\b/i,
  /\bMERGE\s+INTO\b/i,
];
const REQUIRED_MARKERS = [
  'source_reference',
  'operational_decision',
  'dry_run_required',
  'rollback_plan_required',
];
const CANDIDATE_RE = /^(worker-airtrust\/migrations\/|scripts\/).+\.(sql|sh|mjs|js)$/;

export function parseNameStatus(raw) {
  const fields = raw.split('\0');
  const candidates = new Set();
  const exactRenames = new Set();

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;

    const renameOrCopy = /^([RC])(\d{3})$/.exec(status);
    if (renameOrCopy) {
      const source = fields[index++] ?? '';
      const destination = fields[index++] ?? '';
      if (!source || !destination) continue;

      if (renameOrCopy[1] === 'R' && renameOrCopy[2] === '100') {
        exactRenames.add(destination);
      } else {
        candidates.add(destination);
      }
      continue;
    }

    const file = fields[index++] ?? '';
    if (file && /^[AMTU]/.test(status)) candidates.add(file);
  }

  return {
    candidates: [...candidates],
    exactRenames: [...exactRenames],
  };
}

function readGitNameStatus(args, root) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function collectNameStatusReports(root, baseRef) {
  const branchArgs = [
    'diff',
    '--name-status',
    '-M',
    '-C',
    '--diff-filter=AMR',
    '-z',
    `${baseRef}...HEAD`,
  ];
  const worktreeArgs = ['diff', '--name-status', '-M', '-C', '--diff-filter=AMR', '-z'];
  const stagedArgs = ['diff', '--cached', '--name-status', '-M', '-C', '--diff-filter=AMR', '-z'];

  return [
    readGitNameStatus(branchArgs, root),
    readGitNameStatus(worktreeArgs, root),
    readGitNameStatus(stagedArgs, root),
  ];
}

export function getChangedFiles({ root = process.cwd(), baseRef = 'origin/main' } = {}) {
  const candidates = new Set();
  const exactRenames = new Set();

  for (const report of collectNameStatusReports(root, baseRef)) {
    const parsed = parseNameStatus(report);
    for (const file of parsed.candidates) candidates.add(file);
    for (const file of parsed.exactRenames) exactRenames.add(file);
  }

  const untrackedArgs = ['ls-files', '--others', '--exclude-standard', '-z'];
  const untracked = readGitNameStatus(untrackedArgs, root);
  for (const file of untracked.split('\0').filter(Boolean)) candidates.add(file);
  for (const file of candidates) exactRenames.delete(file);

  return [...candidates]
    .filter((file) => CANDIDATE_RE.test(file))
    .filter((file) => !exactRenames.has(file))
    .sort();
}

function containsDml(content) {
  return DML_PATTERNS.some((pattern) => pattern.test(content));
}

export function findOperationalSqlViolations({ root = process.cwd(), files } = {}) {
  const violations = [];
  const changedFiles = files ?? getChangedFiles({ root });

  for (const file of changedFiles) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    if (!containsDml(content)) continue;
    if (REQUIRED_MARKERS.some((marker) => content.includes(marker))) continue;

    violations.push({
      file,
      reason: 'changed_file_with_dml_missing_source_marker',
      requiredMarkers: REQUIRED_MARKERS,
    });
  }

  return violations;
}

function main() {
  const violations = findOperationalSqlViolations();
  if (violations.length > 0) {
    console.error(JSON.stringify({ ok: false, violations }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ ok: true, checkedMarkers: REQUIRED_MARKERS }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
