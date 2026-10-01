import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const workflow = readFileSync(join(ROOT, '.github/workflows/heavy-ci.yml'), 'utf8');

describe('public-e2e browser setup', () => {
  it('caches browser binaries without reducing Chromium/WebKit coverage', () => {
    expect(workflow).toContain('uses: actions/cache@v4');
    expect(workflow).toContain('path: ~/.cache/ms-playwright');
    expect(workflow).toContain("key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}");
    expect(workflow).toContain('npx playwright install-deps chromium webkit');
    expect(workflow).toContain("if: steps.playwright-cache.outputs.cache-hit != 'true'");
    expect(workflow).toContain('npx playwright install chromium webkit');
    expect(workflow).toContain('--project=chromium');
    expect(workflow).toContain('--project=webkit-ipad');
  });
});
