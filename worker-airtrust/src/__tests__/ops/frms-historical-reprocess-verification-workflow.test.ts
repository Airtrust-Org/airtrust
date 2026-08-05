import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// This contract intentionally validates only sanitized, aggregate production evidence.
const workflow = readFileSync(
  join(process.cwd(), '..', '.github', 'workflows', 'frms-historical-reprocess-verification.yml'),
  'utf8',
);

describe('FRMS production reprocessing verification workflow', () => {
  it('is production-gated and bound to the exact execution provenance', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('EXECUTION_SOURCE_SHA: 2578ee339be7788bf3cc5a1da8a23bd50b06b524');
    expect(workflow).toContain(
      'EXECUTION_SCOPE: formula:frms-regulatory-integrity-20260804-v2:sha:2578ee339be7788bf3cc5a1da8a23bd50b06b524',
    );
    expect(workflow).toContain('Verification must run from the current main SHA.');
  });

  it('performs only SELECT verification queries and publishes sanitized counts', () => {
    expect(workflow).toContain('sql="SELECT');
    expect(workflow).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+(?:INTO|TABLE|FROM|cron_|frms_)/i,
    );
    expect(workflow).toContain('active_journeys');
    expect(workflow).toContain('active_factorization_duplicates');
    expect(workflow).toContain('review_required');
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain("RECORD_ISSUE: '827'");
  });

  it('requires terminal success, complete coverage and no unfinished or duplicate rows', () => {
    expect(workflow).toContain('"$latest_outcome" == \'SUCCEEDED\'');
    expect(workflow).toContain('"$failed" == \'0\'');
    expect(workflow).toContain('"$unfinished" == \'0\'');
    expect(workflow).toContain('"$succeeded" == "$active_journeys"');
    expect(workflow).toContain('"$duplicates" == \'0\'');
    expect(workflow).toContain("outcome='VERIFIED_SUCCESS'");
  });
});
