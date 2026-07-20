#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const workflowsDir = path.resolve('.github/workflows');
const workflowFiles = fs
  .readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort();

const violations = [];

for (const fileName of workflowFiles) {
  const filePath = path.join(workflowsDir, fileName);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let inJobs = false;
  let currentJob = null;
  let inJobEnv = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      inJobs = /^jobs:\s*$/.test(trimmed);
      currentJob = null;
      inJobEnv = false;
      continue;
    }

    if (!inJobs) continue;

    if (indent === 2 && /^[A-Za-z0-9_-]+:\s*(?:#.*)?$/.test(trimmed)) {
      currentJob = trimmed.slice(0, trimmed.indexOf(':'));
      inJobEnv = false;
      continue;
    }

    if (currentJob && indent === 4 && /^env:\s*(?:#.*)?$/.test(trimmed)) {
      inJobEnv = true;
      continue;
    }

    if (inJobEnv && indent <= 4) inJobEnv = false;

    if (inJobEnv && /\$\{\{\s*runner\./.test(line)) {
      violations.push(`${fileName}:${index + 1} jobs.${currentJob}.env cannot use runner context`);
    }
  }
}

if (violations.length > 0) {
  console.error('GITHUB_WORKFLOW_CONTEXT_GUARD_NO_GO');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`GITHUB_WORKFLOW_CONTEXT_GUARD_PASS (${workflowFiles.length} workflows)`);
