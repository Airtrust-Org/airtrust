#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const DML_RE = /\b(INSERT\s+INTO|UPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET|DELETE\s+FROM|REPLACE\s+INTO|MERGE\s+INTO)\b/i;
const REQUIRED_MARKERS = [
  'source_reference',
  'operational_decision',
  'dry_run_required',
  'rollback_plan_required',
];
const CANDIDATE_RE = /^(worker-airtrust\/migrations\/|scripts\/).+\.(sql|sh|mjs|js)$/;

function getChangedFiles() {
  const changed = new Set();

  try {
    const revParse = execFileSync('git', ['rev-parse', '--verify', 'origin/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const diff = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=AMR', `${revParse}...HEAD`],
      { encoding: 'utf8' },
    );

    diff
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => CANDIDATE_RE.test(line))
      .forEach((line) => changed.add(line));
  } catch {
    // Fallback to working tree below.
  }

  const status = execFileSync('git', ['status', '--short'], { encoding: 'utf8' });
  status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((line) => CANDIDATE_RE.test(line))
    .forEach((line) => changed.add(line));

  return [...changed];
}

const violations = [];

for (const file of getChangedFiles()) {
  if (!fs.existsSync(file)) continue; // ignore deletions still listed in `git status`
  const content = fs.readFileSync(file, 'utf8');
  if (!DML_RE.test(content)) continue;

  const hasMarker = REQUIRED_MARKERS.some((marker) => content.includes(marker));
  if (!hasMarker) {
    violations.push({
      file,
      reason: 'changed_file_with_dml_missing_source_marker',
      requiredMarkers: REQUIRED_MARKERS,
    });
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ ok: false, violations }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checkedMarkers: REQUIRED_MARKERS }, null, 2));
