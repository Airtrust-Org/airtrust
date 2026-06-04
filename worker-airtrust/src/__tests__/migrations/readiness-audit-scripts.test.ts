import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationAuditScript = fileURLToPath(
  new URL('../../../../scripts/audit-migration-chain-readiness.sh', import.meta.url),
);
const dataQualityAuditScript = fileURLToPath(
  new URL('../../../../scripts/audit-data-quality-readiness.sh', import.meta.url),
);

function runBash(scriptPath: string) {
  return spawnSync('bash', [scriptPath], {
    encoding: 'utf8',
  });
}

describe('readiness audit scripts', () => {
  it('passes the migration chain readiness dry-run audit', () => {
    const result = runBash(migrationAuditScript);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('[migration-readiness] PASS:');
    expect(result.stdout).toContain('canonical_sql_files=');
  });

  it('passes the data-quality readiness dry-run audit', () => {
    const result = runBash(dataQualityAuditScript);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('[data-quality-readiness] PASS:');
    expect(result.stdout).toContain('critical_routes_tenant_scoped=YES');
  });
});
