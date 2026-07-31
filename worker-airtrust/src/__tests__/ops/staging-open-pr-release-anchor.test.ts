import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');

describe('deploy-staging open PR release anchor', () => {
  it('does not require an open reviewed PR head to remain the current main SHA', () => {
    const openPrBranchStart = workflow.indexOf("if (pr.state === 'open')");
    const mergedPrBranchStart = workflow.indexOf("} else if (pr.merged === true)", openPrBranchStart);

    expect(openPrBranchStart).toBeGreaterThan(-1);
    expect(mergedPrBranchStart).toBeGreaterThan(openPrBranchStart);

    const openPrBranch = workflow.slice(openPrBranchStart, mergedPrBranchStart);
    expect(openPrBranch).toContain('OPEN_PR_HEAD_MISMATCH');
    expect(openPrBranch).not.toContain('RELEASE_SHA_NOT_CURRENT_MAIN');
  });

  it('keeps the current-main requirement limited to already merged PR releases', () => {
    const mergedPrBranchStart = workflow.indexOf("} else if (pr.merged === true)");
    const finalElseStart = workflow.indexOf('} else {', mergedPrBranchStart);

    expect(mergedPrBranchStart).toBeGreaterThan(-1);
    expect(finalElseStart).toBeGreaterThan(mergedPrBranchStart);

    const mergedPrBranch = workflow.slice(mergedPrBranchStart, finalElseStart);
    expect(mergedPrBranch).toContain('MERGED_PR_SHA_MISMATCH');
    expect(mergedPrBranch).toContain('RELEASE_SHA_NOT_CURRENT_MAIN');
  });
});
