import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const CANONICAL_REPO = 'Airtrust-Org/airtrust';
const LEGACY_REPO = 'airtrustsystem-alt/airtrust';

function read(path: string) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('GitHub canonical release provenance', () => {
  it.each([
    '.github/workflows/deploy-staging.yml',
    '.github/workflows/deploy-airtrust.yml',
    'scripts/lib/worker-provenance.sh',
  ])('uses the canonical repository in active release path %s', (path) => {
    const source = read(path);
    expect(source).toContain(CANONICAL_REPO);
    expect(source).not.toContain(LEGACY_REPO);
  });

  it('runs structural postconditions for Schema V2 changes 0467-0469', () => {
    const workflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(workflow).toContain('validate-0467-0469-production-postconditions.sh');
    expect(workflow).toContain('sigvoos-shadow-parallel-0467');
    expect(workflow).toContain('sigvoos-shadow-leg-crew-0468');
    expect(workflow).toContain('lms-completion-diagnostics-0469');
  });
});
