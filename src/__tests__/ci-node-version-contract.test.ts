import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const requiredWorkflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/pr-check.yml',
] as const;

describe('required CI Node baseline', () => {
  it('declares Node 24 as the repository baseline', () => {
    expect(readFileSync('.node-version', 'utf8').trim()).toBe('24');
  });

  for (const workflow of requiredWorkflows) {
    it(`${workflow} does not run the project on deprecated Node 20`, () => {
      const source = readFileSync(workflow, 'utf8');

      expect(source).not.toMatch(/node-version:\s*['"]?20['"]?/);
      expect(source).toMatch(/node-version(?:-file)?:/);
    });
  }

  it('keeps default workflow permissions read-only where changed', () => {
    for (const workflow of requiredWorkflows) {
      const source = readFileSync(workflow, 'utf8');
      expect(source).toMatch(/permissions:\s*\n\s+contents:\s+read/);
    }
  });
});
