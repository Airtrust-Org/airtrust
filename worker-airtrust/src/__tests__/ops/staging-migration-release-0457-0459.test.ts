import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/)/.test(line))
    .join('\n');
}

describe('staging migration release 0457/0459', () => {
  const runner = read('scripts/staging/apply-approved-migrations.sh');
  const recoveryRunner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');

  it('keeps the canonical preflight scope aligned with the approved migration allowlist', () => {
    expect(runner).toContain('0457_qualification_category_lms_contract.sql');
    expect(runner).toContain('0459_sk76_periodic_code_denominator.sql');
    expect(runner).toContain(
      'RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454,0457,0459,0467,0468,0469,0470,0472,0475,0476,0481,0482"',
    );
    expect(stripComments(runner)).not.toMatch(/wrangler\s+d1\s+migrations\s+apply/);
  });

  // HEALTH P0-08/#477: 0457 and 0459 no longer fall through to a bare
  // `wrangler d1 execute --file=` call inside apply-approved-migrations.sh.
  // They are routed to the ledger-aware, idempotent recovery-point runner,
  // which is where their postcondition validators are actually invoked now.
  it('routes both migrations to the governed recovery-point runner, not a bare wrangler call', () => {
    expect(runner).toContain('"0457_qualification_category_lms_contract.sql"');
    expect(runner).toContain('"0459_sk76_periodic_code_denominator.sql"');
    expect(runner).not.toContain('--file="../$migration_path"');
    expect(recoveryRunner).toContain('"0457_qualification_category_lms_contract.sql"');
    expect(recoveryRunner).toContain('"0459_sk76_periodic_code_denominator.sql"');
  });

  it('requires dedicated postcondition validators after both migrations', () => {
    expect(recoveryRunner).toContain('validate-0457-postconditions.sh');
    expect(recoveryRunner).toContain('validate-0459-postconditions.sh');
  });

  it.each(['0457', '0459'])('keeps validate-%s staging-only and read-only', (prefix) => {
    const validator = read(`scripts/staging/validate-${prefix}-postconditions.sh`);
    expect(validator).toContain('airtrust-db-staging-baseline-20260701');
    expect(validator).toContain('7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae');
    expect(validator).toContain('--remote --json --command');
    expect(validator).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
    expect(validator).not.toContain('airtrust-db-production');
  });

  it('0457 validator checks the structural category/LMS invariants', () => {
    const validator = read('scripts/staging/validate-0457-postconditions.sh');
    expect(validator).toContain("name='lms_integrada'");
    expect(validator).toContain('ux_qualificacoes_categorias_lms_integrada_active');
    expect(validator).toContain("name LIKE '%_0457'");
    expect(validator).toContain('HAVING COUNT(*) > 1');
  });

  it('0459 validator proves the six /03 identities and rejects residual /04 identities', () => {
    const validator = read('scripts/staging/validate-0459-postconditions.sh');
    expect(validator).toContain('S76-P-01/04-C1');
    expect(validator).toContain('S76-P-01/03-C1');
    expect(validator).toContain('n !== 6');
    expect(validator).toContain('trg_modelo_versao_integridade_update');
  });
});
