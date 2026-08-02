import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflowPaths = [
  '.github/workflows/deploy-airtrust.yml',
  '.github/workflows/apply-schema-change-v2.yml',
];

function runBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*[|>-]?\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() && line.search(/\S/) <= indent) break;
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

describe('privileged workflow dispatch safety', () => {
  for (const path of workflowPaths) {
    it(`${path} never interpolates workflow_dispatch input inside run`, () => {
      const source = readFileSync(path, 'utf8');
      for (const block of runBlocks(source)) {
        expect(block).not.toContain('${{ inputs.');
        expect(block).not.toContain('${{ github.event.inputs.');
      }
    });

    it(`${path} declares read-only default token permissions`, () => {
      const source = readFileSync(path, 'utf8');
      expect(source).toMatch(/\npermissions:\n\s+contents: read\n/);
    });
  }

  it('Schema V2 accepts a reviewed change ID instead of free SQL metadata', () => {
    const source = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
    expect(source).toContain('build-reviewed-schema-apply.mjs');
    expect(source).toContain('Apply schema and ledger atomically');
    expect(source).not.toMatch(/^\s{6}(baseline_id|file_path|file_hash|plan_hash):/m);
  });
});

// Extracts the ordered list of step blocks for a single top-level job. Each
// element is the raw text of one `- name: ...` / `- uses: ...` list item,
// including its nested keys, so callers can assert both presence and order
// of steps (e.g. "checkout happens before the versioned script runs").
function extractJobSteps(source, jobName) {
  const lines = source.split('\n');
  const jobHeaderIndex = lines.findIndex((line) => line === `  ${jobName}:`);
  if (jobHeaderIndex === -1) {
    throw new Error(`job "${jobName}" not found`);
  }

  const jobLines = [];
  for (let index = jobHeaderIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    // Any non-blank line back at 2-space indent (or less) starts the next
    // top-level job — the guard job's body has ended.
    if (line.trim() && /^ {0,2}\S/.test(line)) break;
    jobLines.push(line);
  }

  const stepsHeaderIndex = jobLines.findIndex((line) => line === '    steps:');
  if (stepsHeaderIndex === -1) {
    throw new Error(`job "${jobName}" has no steps:`);
  }

  const steps = [];
  let current = null;
  for (const line of jobLines.slice(stepsHeaderIndex + 1)) {
    if (/^ {6}- /.test(line)) {
      if (current) steps.push(current.join('\n'));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) steps.push(current.join('\n'));
  return steps;
}

describe('deploy-airtrust.yml Release Guard checks out sources before running the versioned validator', () => {
  const source = readFileSync('.github/workflows/deploy-airtrust.yml', 'utf8');
  const steps = extractJobSteps(source, 'guard');

  it('runs scripts/ci/validate-production-deploy-dispatch.mjs from a checked-out workspace, as the first step', () => {
    const validatorStepIndex = steps.findIndex((step) =>
      step.includes('scripts/ci/validate-production-deploy-dispatch.mjs'),
    );
    expect(validatorStepIndex).toBeGreaterThanOrEqual(0);

    const checkoutStepIndex = steps.findIndex((step) => step.includes('uses: actions/checkout@v4'));
    // The guard job has no earlier step available to populate the workspace,
    // so checkout must be the very first step, not merely "before" the
    // validator somewhere in the middle.
    expect(checkoutStepIndex).toBe(0);
    expect(checkoutStepIndex).toBeLessThan(validatorStepIndex);
  });
});
