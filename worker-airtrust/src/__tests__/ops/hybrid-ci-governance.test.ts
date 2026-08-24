import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const githubCi = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const gcbCi = readFileSync(join(ROOT, 'cloudbuild.ci.yaml'), 'utf8');

const FAST_GATES = ['lint', 'build-content-gates', 'worker-typecheck'] as const;
const HEAVY_GATES = [
  'frontend-coverage',
  'worker-tests-1',
  'worker-tests-2',
  'lms-smoke',
  'public-e2e',
] as const;

const RETIRED_DUPLICATE_WORKFLOWS = [
  '.github/workflows/lint.yml',
  '.github/workflows/test.yml',
  '.github/workflows/demo-data-prevention.yml',
  '.github/workflows/internal-docs-prevention.yml',
] as const;

describe('hybrid CI governance', () => {
  it('keeps exactly the three fast gates in GitHub Actions', () => {
    for (const gate of FAST_GATES) {
      expect(githubCi).toContain(`  ${gate}:`);
    }
    for (const gate of HEAVY_GATES) {
      expect(githubCi).not.toContain(`  ${gate}:`);
    }
    expect(githubCi).toContain('cancel-in-progress: true');
    expect(githubCi).toContain('push:\n    branches: [main]');
    expect(githubCi).toContain('pull_request:\n    branches: [main]');
  });

  it('keeps fast safety checks consolidated instead of duplicated', () => {
    expect(githubCi).toContain('npm run lint');
    expect(githubCi).toContain('node scripts/guard-lint-format-delta.mjs');
    expect(githubCi).toContain('node scripts/guard-risk-test-delta.mjs');
    expect(githubCi).toContain('npm run ops:guard');
    expect(githubCi).toContain('./scripts/ci-internal-docs-check.sh');
    expect(githubCi).toContain('npm run check:demo-data');
    for (const path of RETIRED_DUPLICATE_WORKFLOWS) {
      expect(existsSync(join(ROOT, path))).toBe(false);
    }
  });

  it('keeps exactly the five heavy gates in Google Cloud Build', () => {
    for (const gate of HEAVY_GATES) {
      expect(gcbCi).toContain(`id: ${gate}`);
    }
    for (const gate of FAST_GATES) {
      expect(gcbCi).not.toContain(`id: ${gate}`);
    }
    expect(gcbCi).toContain('id: frontend-coverage\n    waitFor: ["bootstrap"]');
    expect(gcbCi).toContain('id: worker-tests-1\n    waitFor: ["bootstrap"]');
  });

  it('still covers all eight required gates with no duplication', () => {
    expect(new Set([...FAST_GATES, ...HEAVY_GATES]).size).toBe(8);
  });
});
