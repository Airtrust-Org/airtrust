import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const runner = readFileSync(join(ROOT, 'scripts/staging/apply-0498-frms-parametric-v2.sh'), 'utf8');
const post = readFileSync(join(ROOT, 'scripts/staging/validate-0498-postconditions.sh'), 'utf8');

describe('FRMS 0498 staging governed apply', () => {
  it('uses the bounded query transport instead of the D1 bulk-import reset path', () => {
    expect(runner).toContain('--command "$sql_payload" --json');
    expect(runner).not.toContain('--file="$combined"');
    expect(runner).toContain('0498 SQL bundle exceeds bounded --command transport');
  });

  it('captures Time Travel before the remote write and keeps exact manifest/hash guards', () => {
    const recovery = runner.indexOf('d1 time-travel info');
    const write = runner.indexOf('--command "$sql_payload" --json');
    expect(recovery).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(recovery);
    expect(runner).toContain('REVIEWED_MANIFEST_MISMATCH');
    expect(runner).toContain('cmp -s "$migration_arg" "$schema_sql_path"');
  });

  it('post-validates policy activation, audit columns and double-count protections', () => {
    expect(post).toContain('FRMS_OPERATIONAL_POLICY_V2');
    expect(post).toContain('operational_load_imc_delta');
    expect(post).toContain('recovery_credit_applied_points');
    expect(post).toContain('LANDINGS_NEUTRAL_MAX');
    expect(post).toContain('FORTNIGHT_IMPACT_DAYS_WITHOUT_DUTY');
  });
});
