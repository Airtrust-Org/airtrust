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
