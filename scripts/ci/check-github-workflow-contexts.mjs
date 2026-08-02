#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workflowsDir = path.resolve('.github/workflows');
const timeoutProtectedWorkflows = new Set([
  'ci.yml',
  'demo-data-prevention.yml',
  'internal-docs-prevention.yml',
  'lint.yml',
  'pr-check.yml',
  'test.yml',
]);
const failClosedWorkflows = new Set(['ci.yml', 'lint.yml', 'pr-check.yml']);

export function inspectWorkflowText(fileName, text) {
  const lines = text.split(/\r?\n/);
  const violations = [];
  let inJobs = false;
  let currentJob = null;
  let inJobEnv = false;
  let currentJobHasTimeout = false;

  const finishCurrentJob = () => {
    if (currentJob && timeoutProtectedWorkflows.has(fileName) && !currentJobHasTimeout) {
      violations.push(`${fileName} jobs.${currentJob} must define timeout-minutes`);
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      finishCurrentJob();
      inJobs = /^jobs:\s*$/.test(trimmed);
      currentJob = null;
      inJobEnv = false;
      currentJobHasTimeout = false;
      continue;
    }

    if (!inJobs) continue;

    if (indent === 2 && /^[A-Za-z0-9_-]+:\s*(?:#.*)?$/.test(trimmed)) {
      finishCurrentJob();
      currentJob = trimmed.slice(0, trimmed.indexOf(':'));
      inJobEnv = false;
      currentJobHasTimeout = false;
      continue;
    }

    if (currentJob && indent === 4 && /^timeout-minutes:\s*[1-9][0-9]*\s*(?:#.*)?$/.test(trimmed)) {
      currentJobHasTimeout = true;
    }

    if (
      currentJob &&
      failClosedWorkflows.has(fileName) &&
      /^continue-on-error:\s*true\s*(?:#.*)?$/.test(trimmed)
    ) {
      violations.push(`${fileName}:${index + 1} jobs.${currentJob} cannot continue on error`);
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

  finishCurrentJob();
  return violations;
}

export function inspectWorkflows(directory = workflowsDir) {
  const workflowFiles = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
  const violations = [];

  for (const fileName of workflowFiles) {
    const filePath = path.join(directory, fileName);
    violations.push(...inspectWorkflowText(fileName, fs.readFileSync(filePath, 'utf8')));
  }

  return { workflowFiles, violations };
}

function main() {
  const { workflowFiles, violations } = inspectWorkflows();

  if (violations.length > 0) {
    console.error('GITHUB_WORKFLOW_CONTEXT_GUARD_NO_GO');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exit(1);
  }

  console.log(`GITHUB_WORKFLOW_CONTEXT_GUARD_PASS (${workflowFiles.length} workflows)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
