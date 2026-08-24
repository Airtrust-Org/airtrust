import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const script = readFileSync(join(ROOT, 'scripts/publish-gcb-github-status.sh'), 'utf8');

describe('canonical GCB GitHub status publisher', () => {
  it('publishes only the canonical airtrust-gcb context to Airtrust-Org/airtrust', () => {
    expect(script).toContain('REPO="Airtrust-Org/airtrust"');
    expect(script).toContain('CONTEXT="airtrust-gcb"');
    expect(script).toContain('repos/${REPO}/statuses/${sha}');
    expect(script).not.toContain('glab api');
    expect(script).not.toContain('airtrust-group%2Fairtrust');
  });

  it('maps failed to GitHub failure and validates exact SHA + GCB URL', () => {
    expect(script).toContain('failed) github_state="failure"');
    expect(script).toContain('[[ "$sha" =~ ^[0-9a-f]{40}$ ]]');
    expect(script).toContain('https://console.cloud.google.com/cloud-build/builds/*');
    expect(script).toContain('repos/${REPO}/commits/${sha}');
  });

  it('keeps credentials outside the script and supports dry-run', () => {
    expect(script).toContain('--dry-run');
    expect(script).not.toMatch(/(GITHUB_TOKEN|GH_TOKEN|password|secret)=/i);
  });
});
